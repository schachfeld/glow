import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import {
  addRoute,
  connectionRoutes,
  connectionUrl,
  createCore,
  pickRoute,
  HomeAssistant,
  tokenProvider,
  websocketUrl,
  type AccessGrant,
  type Connection,
  type GlowCore,
  type SceneData,
  type Home,
} from "../core";
import { createDemo } from "../../../packages/core/model.mjs";
import { probeRoute, requestToken, sceneRequest, verifyRoute } from "./http";
import { createSocket } from "./socket";
import { sceneStore } from "./storage";

// The addresses one Home Assistant answers at, and the one in use.
export interface Routes {
  routes: string[];
  current: string;
}

export interface RouteControl {
  get(): Routes;
  subscribe(onRoutes: (routes: Routes) => void): () => void;
  // Checks that the address leads to this Home Assistant before adding it.
  add(input: string): Promise<string[]>;
  set(routes: string[]): void;
  connection(): Connection;
}

export interface GlowClient {
  mode: "live" | "demo";
  routes?: RouteControl;
  subscribe(onHome: (home: Home) => void): () => void;
  execute(method: string, path: string, body?: object): Promise<unknown>;
  close(): void;
}

const wrap = (
  core: GlowCore,
  mode: GlowClient["mode"],
  close: () => void,
  routes?: RouteControl,
): GlowClient => ({
  mode,
  routes,
  subscribe: (onHome: (home: Home) => void) => core.subscribe(onHome),
  execute: (method: string, path: string, body?: object) =>
    core.execute(method, path, body),
  close,
});

// Connects straight to Home Assistant; no Glow add-on or server is needed.
export async function connect(
  connection: Connection,
  signal: AbortSignal,
  initialGrant?: AccessGrant,
): Promise<GlowClient> {
  // Local data stays keyed by the sign-in address, whichever route is used.
  const url = connectionUrl(connection.url);
  const store = await sceneStore(url);
  let routes = connectionRoutes(connection);
  // Use the first address that answers. If none do yet, start with the first
  // and keep looking while Home Assistant retries.
  let current = (await pickRoute(routes, probeRoute)) ?? routes[0];
  if (signal.aborted) throw new Error("Connection cancelled.");
  const ha = new HomeAssistant({
    url: websocketUrl(current),
    apiUrl: new URL("api/", current).href,
    sceneRequest,
    // Tokens are renewed over the route in use; every route shares them.
    getToken: tokenProvider(
      connection,
      (request) => requestToken({ ...request, baseUrl: current }),
      initialGrant,
    ),
    timeoutMs: 25000,
    createSocket,
  });
  const core = createCore({ ha, store });

  const listeners = new Set<(routes: Routes) => void>();
  const announce = () => {
    for (const listener of listeners) listener({ routes, current });
  };
  const use = (route: string) => {
    current = route;
    ha.url = websocketUrl(route);
    ha.apiUrl = new URL("api/", route).href;
    announce();
  };
  // Moves to the earliest route that answers, when that is not the one in
  // use: after a disconnect, on returning to Glow, when the network changes,
  // and every minute while a later route is in use.
  let closed = false;
  let checking = false;
  const reroute = async () => {
    if (closed || checking || routes.length < 2) return;
    if (ha.connected && current === routes[0]) return;
    checking = true;
    try {
      const best = await pickRoute(routes, probeRoute);
      if (closed || !best || best === current) return;
      use(best);
      ha.reconnect();
    } finally {
      checking = false;
    }
  };
  let wasConnected = false;
  const onChange = () => {
    if (!ha.connected && !ha.stopped && (wasConnected || ha.error))
      void reroute();
    wasConnected = ha.connected;
  };
  const abort = () => {
    closed = true;
    clearInterval(recheck);
    ha.off("change", onChange);
    ha.stop();
    core.close();
  };
  const recheck = setInterval(() => {
    if (current !== routes[0] || !ha.connected) void reroute();
  }, 60000);
  signal.addEventListener("abort", abort, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          finish(
            new Error(
              "Cannot connect. Check your address, network, and sign-in.",
            ),
          ),
        40000,
      );
      const check = () => {
        if (ha.connected) finish();
        // A stopped client was refused for good, such as a revoked sign-in.
        else if (ha.error)
          finish(
            Object.assign(new Error(ha.error), { reauthenticate: ha.stopped }),
          );
      };
      const cancel = () => finish(new Error("Connection cancelled."));
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        ha.off("change", check);
        signal.removeEventListener("abort", cancel);
        if (error) reject(error);
        else resolve();
      };
      signal.addEventListener("abort", cancel, { once: true });
      ha.on("change", check);
      ha.on("change", onChange);
      ha.start();
    });
  } catch (error) {
    abort();
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
  }
  // Phones suspend sockets in the background. Reconnect on returning to Glow,
  // and when the network comes back.
  let state: string = AppState.currentState ?? "active";
  const appState = AppState.addEventListener("change", (next) => {
    if (state.match(/inactive|background/) && next === "active") {
      ha.reconnect();
      void reroute();
    }
    state = next;
  });
  // Joining another Wi-Fi network or turning on a VPN changes which routes
  // answer, even while the phone stays online.
  let online: boolean | null = null;
  let network = "";
  const stopNetwork = NetInfo.addEventListener(
    ({ isConnected, type, details }) => {
      const key = `${type}:${JSON.stringify(details ?? null)}`;
      if (online === false && isConnected) ha.reconnect();
      if (isConnected && network && key !== network) void reroute();
      online = isConnected;
      network = key;
    },
  );
  const control: RouteControl = {
    get: () => ({ routes, current }),
    subscribe(onRoutes) {
      listeners.add(onRoutes);
      return () => listeners.delete(onRoutes);
    },
    async add(input) {
      const next = addRoute(routes, input);
      const route = next[next.length - 1];
      await verifyRoute(route, await ha.getToken());
      // The list may have changed while the address was checked.
      return addRoute(routes, route);
    },
    set(next) {
      if (!next.length) return;
      routes = next.map((route) => connectionUrl(route));
      if (!routes.includes(current)) {
        use(routes[0]);
        ha.reconnect();
      } else announce();
      void reroute();
    },
    connection: () => ({ ...connection, routes }),
  };
  return wrap(
    core,
    "live",
    () => {
      appState.remove();
      stopNetwork();
      abort();
    },
    control,
  );
}

// A demo home with the web app's sample rooms. It never touches real lights.
export async function connectDemo(): Promise<GlowClient> {
  const store = await sceneStore(
    "demo",
    "demo-home",
    createDemo() as unknown as SceneData,
  );
  const core = createCore({ store });
  return wrap(core, "demo", () => core.close());
}
