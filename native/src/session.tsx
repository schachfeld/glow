import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { connectionUrl, type AccessGrant, type Connection } from "./core";
import {
  beginLogin,
  cancelLogin,
  listenForLogin,
  type AuthorizedAccount,
} from "./platform/auth";
import {
  addSavedRoute,
  connect,
  connectDemo,
  type GlowClient,
} from "./platform/client";
import {
  forgetConnection,
  loadSecureConnection,
  saveSecureConnection,
  secureStorageAvailable,
} from "./platform/storage";

// Signing in, staying signed in, and opening the home. The same flow as the
// Tauri app, which phones always run with secure storage available.
function useSessionState() {
  const [client, setClient] = useState<GlowClient | null>(null);
  const clientRef = useRef<GlowClient | null>(null);
  const pending = useRef<AbortController | null>(null);
  const [method, setMethod] = useState<"account" | "token">("account");
  const [authorizing, setAuthorizing] = useState(false);
  const [authorized, setAuthorized] = useState<AuthorizedAccount | null>(null);
  const acceptCallbacks = useRef(true);
  const [secure, setSecure] = useState(true);
  const [saved, setSaved] = useState<Connection | null>(null);
  const [checking, setChecking] = useState(true);
  const [url, setUrl] = useState("http://homeassistant.local:8123");
  const [token, setToken] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Saves run one after another, so a later address list never loses to an
  // earlier one that finishes last.
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const persist = (connection: () => Connection) => {
    const run = saving.current.then(() => {
      const next = connection();
      return saveSecureConnection(next).then(() => next);
    });
    saving.current = run.catch(() => {});
    return run;
  };

  const show = (next: GlowClient) => {
    clientRef.current = next;
    setClient(next);
  };

  const open = async (
    connection: Connection,
    options: { grant?: AccessGrant; keep?: boolean; fromSaved?: boolean } = {},
  ) => {
    setError("");
    setBusy(true);
    const controller = new AbortController();
    pending.current = controller;
    let next: GlowClient | undefined;
    // Addresses Glow finds are kept with a saved sign-in.
    const learned = (found: Connection) => {
      if (!options.keep && !options.fromSaved) return;
      persist(() => found)
        .then(setSaved)
        .catch(() => {});
    };
    try {
      next = await connect(
        connection,
        controller.signal,
        options.grant,
        learned,
      );
      if (options.keep) {
        const client = next;
        try {
          setSaved(
            await persist(() => client.routes?.connection() ?? connection),
          );
        } catch {
          throw new Error(
            "Could not save your sign-in on this device. Turn off “Stay signed in” to continue without saving it.",
          );
        }
      }
      if (controller.signal.aborted) {
        next.close();
        return;
      }
      show(next);
      setToken("");
      setAuthorized(null);
    } catch (cause) {
      next?.close();
      if (controller.signal.aborted) return;
      const failure = cause as Error & { reauthenticate?: boolean };
      // A sign-in Home Assistant no longer accepts is of no use; forget it.
      if (options.fromSaved && failure?.reauthenticate) {
        await forgetConnection().catch(() => {});
        setSaved(null);
        setRemember(secure);
      }
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not connect. Please try again.",
      );
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  };

  useEffect(() => {
    let active = true;
    const stopListening = listenForLogin(
      (account) => {
        if (!active || !acceptCallbacks.current) return;
        setAuthorized(account);
        setUrl(account.connection.url);
        setAuthorizing(false);
        setBusy(false);
        setError("");
      },
      (message) => {
        if (!active || !acceptCallbacks.current) return;
        setAuthorizing(false);
        setBusy(false);
        setError(message);
      },
    );
    (async () => {
      const available = await secureStorageAvailable();
      if (!active) return;
      setSecure(available);
      setRemember(available);
      if (!available) return;
      let connection: Connection | null = null;
      try {
        connection = await loadSecureConnection();
      } catch {
        // For example, a backup restored to a new phone cannot be decrypted.
        await forgetConnection().catch(() => {});
        if (active)
          setError(
            "Glow could not read your saved sign-in. Please sign in again.",
          );
      }
      if (!active || !connection) return;
      setSaved(connection);
      setChecking(false);
      // Open the home straight away, as a native app would.
      void open(connection, { fromSaved: true });
    })()
      .catch(() => {
        if (active)
          setError(
            "Could not check your saved connection. Restart Glow to try again.",
          );
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
      stopListening();
      pending.current?.abort();
      clientRef.current?.close();
    };
  }, []);

  const submit = async () => {
    setError("");
    if (saved) return open(saved, { fromSaved: true });
    if (method === "account" && !authorized) {
      setBusy(true);
      try {
        acceptCallbacks.current = true;
        setAuthorizing(true);
        await beginLogin(url);
      } catch (cause) {
        setAuthorizing(false);
        setBusy(false);
        setError(
          cause instanceof Error ? cause.message : "Could not start sign-in.",
        );
      }
      return;
    }
    let connection: Connection;
    try {
      connection = authorized?.connection ?? {
        url: connectionUrl(url),
        token: token.trim(),
      };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check the address.");
      return;
    }
    if ("token" in connection && !connection.token) {
      setError("Enter a Home Assistant access token.");
      return;
    }
    return open(connection, {
      grant: authorized?.grant,
      keep: remember && secure,
    });
  };

  const cancel = async () => {
    acceptCallbacks.current = false;
    pending.current?.abort();
    try {
      await cancelLogin();
    } catch {
      setError("Could not cancel sign-in. Please restart Glow.");
    }
    setAuthorized(null);
    setAuthorizing(false);
    setBusy(false);
  };

  const forget = async () => {
    setBusy(true);
    setError("");
    try {
      await forgetConnection();
      setSaved(null);
      setRemember(secure);
    } catch {
      setError("Could not forget the saved connection. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const switchMethod = () => {
    setMethod(method === "account" ? "token" : "account");
    setRemember(secure);
    setError("");
    setToken("");
  };

  const openDemo = async () => {
    setError("");
    try {
      show(await connectDemo());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not open the demo.",
      );
    }
  };

  // Changes the addresses Glow tries, and keeps them with a saved sign-in.
  const updateRoutes = async (routes: string[]) => {
    const control = clientRef.current?.routes;
    if (!control) return;
    const previous = control.get().routes;
    control.set(routes);
    if (!saved) return;
    try {
      setSaved(await persist(control.connection));
    } catch {
      control.set(previous);
      throw new Error(
        "Could not save the addresses on this device. Please try again.",
      );
    }
  };

  // Adds an address while Glow cannot reach the saved ones, then opens the
  // home over it.
  const addAddress = async (input: string) => {
    if (!saved) return;
    const added = await addSavedRoute(saved, input);
    try {
      setSaved(await persist(() => added.connection));
    } catch {
      throw new Error(
        "Could not save the address on this device. Please try again.",
      );
    }
    void open(added.connection, { grant: added.grant, fromSaved: true });
  };

  const disconnect = () => {
    clientRef.current?.close();
    clientRef.current = null;
    setClient(null);
  };

  return {
    client,
    method,
    authorizing,
    authorized,
    secure,
    saved,
    checking,
    url,
    setUrl,
    token,
    setToken,
    remember,
    setRemember,
    busy,
    error,
    submit,
    cancel,
    forget,
    switchMethod,
    openDemo,
    updateRoutes,
    addAddress,
    disconnect,
  };
}

type Session = ReturnType<typeof useSessionState>;
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useSessionState();
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext)!;
