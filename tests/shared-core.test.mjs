import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocketServer } from "ws";
import WebSocket from "ws";
import { HomeAssistant } from "../packages/core/home-assistant.mjs";
import { NativeSocket } from "../packages/core/native-socket.mjs";
import { createCore } from "../packages/core/controller.mjs";
import { createDemo } from "../packages/core/model.mjs";
import { connectionUrl, websocketUrl } from "../packages/core/connection.mjs";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("native transport buffers authentication before asynchronous connect resolves", async (t) => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await once(server, "listening");
  const calls = [];
  server.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "auth_required" }));
    socket.on("message", (raw) => {
      const message = JSON.parse(raw);
      calls.push(message);
      if (message.type === "auth") {
        socket.send(JSON.stringify({ type: "auth_ok" }));
        return;
      }
      socket.send(
        JSON.stringify({
          id: message.id,
          type: message.type === "ping" ? "pong" : "result",
          success: true,
          result:
            message.type === "get_states" || message.type.startsWith("config/")
              ? []
              : null,
        }),
      );
    });
  });
  const ha = new HomeAssistant({
    url: `ws://127.0.0.1:${server.address().port}`,
    token: "native-token",
    timeoutMs: 1000,
    retryMs: 10,
    createSocket: (url) =>
      new NativeSocket(url, async (address, receive) => {
        const socket = new WebSocket(address);
        socket.on("message", (data) =>
          receive({ type: "Text", data: data.toString() }),
        );
        socket.on("close", () => receive({ type: "Close" }));
        await once(socket, "open");
        await delay(20);
        return {
          send: async (data) => socket.send(data),
          disconnect: async () => socket.close(),
        };
      }),
  });
  t.after(async () => {
    ha.stop();
    for (const socket of server.clients) socket.terminate();
    await new Promise((resolve) => server.close(resolve));
  });
  const ready = once(ha, "change");
  ha.start();
  await ready;
  assert.equal(ha.connected, true);
  assert.equal(calls[0].access_token, "native-token");
  await ha.call(
    "light",
    "turn_on",
    { brightness: 90 },
    { entity_id: ["light.lamp"] },
  );
  assert.equal(calls.at(-1).type, "call_service");
  const disconnected = once(ha, "change");
  ha.reconnect();
  await disconnected;
  assert.equal(ha.connected, false);
  await once(ha, "change");
  assert.equal(ha.connected, true);
  assert.equal(calls.filter((m) => m.type === "get_states").length, 2);
});

test("closing a native socket during connect closes the eventual connection and ignores late frames", async () => {
  let resolve;
  let disconnected = false;
  const socket = new NativeSocket(
    "ws://home",
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await delay(0);
  socket.close();
  resolve({
    disconnect: async () => {
      disconnected = true;
    },
  });
  await delay(0);
  assert.equal(disconnected, true);
  assert.equal(socket.readyState, 3);
});

test("authentication rejection is terminal, reports an error, and does not retry", async () => {
  let attempts = 0;
  const ha = new HomeAssistant({
    url: "ws://home",
    token: "invalid",
    retryMs: 5,
    timeoutMs: 100,
    createSocket: (url) => {
      attempts++;
      return new NativeSocket(url, async (_, receive) => {
        receive({
          type: "Text",
          data: JSON.stringify({ type: "auth_required" }),
        });
        return {
          send: async () =>
            receive({
              type: "Text",
              data: JSON.stringify({ type: "auth_invalid" }),
            }),
          disconnect: async () => {},
        };
      });
    },
  });
  const changed = once(ha, "change");
  ha.start();
  await changed;
  assert.equal(ha.connected, false);
  assert.match(ha.error, /rejected/);
  await delay(25);
  assert.equal(attempts, 1);
  ha.stop();
});

test("shared core serializes asynchronous scene saves and recovers from failed persistence", async () => {
  let fail = false;
  const store = {
    data: createDemo(),
    async save(next) {
      await delay(5);
      if (fail) throw new Error("Disk full");
      this.data = structuredClone(next);
    },
  };
  const core = createCore({ store });
  const initial = core.state().scenes.length;
  const { rooms, lights } = core.state();
  const light = lights.find((l) => l.roomId === rooms[0].id);
  const body = {
    name: "First",
    roomId: rooms[0].id,
    palette: "warm",
    lights: { [light.id]: { on: true, brightness: 40 } },
  };
  await Promise.all([
    core.execute("POST", "scenes", body),
    core.execute("POST", "scenes", { ...body, name: "Second" }),
  ]);
  assert.equal(core.state().scenes.length, initial + 2);
  fail = true;
  await assert.rejects(
    core.execute("POST", "scenes", { ...body, name: "Unsaved" }),
    /Disk full/,
  );
  assert.equal(core.state().scenes.length, initial + 2);
  fail = false;
  await core.execute("POST", "scenes", { ...body, name: "Recovered" });
  assert.equal(core.state().scenes.length, initial + 3);
  core.close();
});

test("connection URLs preserve proxy prefixes and reject embedded secrets or unsupported schemes", () => {
  assert.equal(
    connectionUrl(" http://homeassistant.local:8123 "),
    "http://homeassistant.local:8123/",
  );
  assert.equal(
    websocketUrl("https://home.example/ha"),
    "wss://home.example/ha/api/websocket",
  );
  for (const url of [
    "home.local",
    "file:///etc/passwd",
    "https://user:secret@home",
    "https://home/?token=secret",
    "https://home/#token",
  ])
    assert.throws(() => connectionUrl(url));
});

test("scene configuration uses current credentials, preserves proxy paths, and handles missing configuration", async () => {
  const requests = [];
  let status = 200;
  let sequence = 0;
  const ha = new HomeAssistant({
    url: "wss://home.example/proxy/api/websocket",
    apiUrl: "https://home.example/proxy/api/",
    getToken: async () => `renewed-token-${++sequence}`,
    sceneRequest: async (request) => {
      requests.push(request);
      return { status, body: { result: "ok" } };
    },
  });
  ha.connected = true;
  await ha.sceneConfig("POST", "glow_example", {
    name: "Evening",
    entities: { "light.lamp": { state: "off" } },
  });
  await ha.sceneConfig("DELETE", "glow_example");
  assert.equal(
    requests[0].url,
    "https://home.example/proxy/api/config/scene/config/glow_example",
  );
  assert.equal(requests[0].token, "renewed-token-1");
  assert.equal(requests[1].token, "renewed-token-2");
  status = 404;
  await assert.rejects(
    ha.sceneConfig("POST", "glow_example", {}),
    /configuration API is unavailable/,
  );
});

test("deleting an already removed HA scene clears its stale local state", async () => {
  const ha = new HomeAssistant({
    url: "ws://home/api/websocket",
    apiUrl: "http://home/api/",
    token: "test-token",
    sceneRequest: async () => ({
      status: 400,
      body: { message: "Resource not found" },
    }),
  });
  ha.connected = true;
  ha.states["scene.old"] = {
    entity_id: "scene.old",
    attributes: { id: "glow_old" },
  };
  await ha.sceneConfig("DELETE", "glow_old");
  assert.equal(ha.states["scene.old"], undefined);
  await assert.rejects(
    ha.sceneConfig("POST", "glow_old", {}),
    /could not save/,
  );
});

test("switching to another address stays connected, and a failed switch shows the disconnect", async (t) => {
  const home = async () => {
    const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await once(server, "listening");
    server.on("connection", (socket) => {
      socket.send(JSON.stringify({ type: "auth_required" }));
      socket.on("message", (raw) => {
        const message = JSON.parse(raw);
        if (message.type === "auth")
          return socket.send(JSON.stringify({ type: "auth_ok" }));
        socket.send(
          JSON.stringify({
            id: message.id,
            type: "result",
            success: true,
            result:
              message.type === "get_states" ||
              message.type.startsWith("config/")
                ? []
                : null,
          }),
        );
      });
    });
    t.after(async () => {
      for (const socket of server.clients) socket.terminate();
      await new Promise((resolve) => server.close(resolve));
    });
    return `ws://127.0.0.1:${server.address().port}`;
  };
  const [first, second] = await Promise.all([home(), home()]);
  const opened = [];
  const ha = new HomeAssistant({
    url: first,
    token: "token",
    timeoutMs: 1000,
    retryMs: 10_000,
    createSocket: (url) => {
      opened.push(url);
      return new WebSocket(url);
    },
  });
  t.after(() => ha.stop());
  const states = [];
  ha.on("change", () => states.push(ha.connected));
  const ready = once(ha, "change");
  ha.start();
  await ready;

  const switched = once(ha, "change");
  ha.switchTo(second, "http://127.0.0.1/api/");
  assert.equal(ha.connected, true);
  await switched;
  assert.deepEqual(states, [true, true]);
  assert.equal(opened.at(-1), second);
  assert.equal(ha.apiUrl, "http://127.0.0.1/api/");

  // Nothing listens on port 9 here, so this switch fails.
  const failed = once(ha, "change");
  ha.switchTo("ws://127.0.0.1:9");
  await failed;
  assert.equal(ha.connected, false);
  assert.deepEqual(states, [true, true, false]);
});
