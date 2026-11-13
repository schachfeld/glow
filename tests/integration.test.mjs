import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createServer } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { createApp } from "../server/app.mjs";
import { HomeAssistant } from "../server/home-assistant.mjs";
import { mapHome } from "../server/model.mjs";

async function fixture(t, options = {}) {
  const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), "glow-test-"));
  const instance = createApp({ dataDir, ...options });
  const server = instance.app.listen(0, "127.0.0.1");
  server.on("upgrade", (req, socket, head) => {
    if (!instance.upgrade(req, socket, head)) socket.destroy();
  });
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    instance.close();
    await new Promise((resolve) => server.close(resolve));
    if (!options.dataDir) rmSync(dataDir, { recursive: true, force: true });
  });
  const request = async (path = "state", method = "GET", body) => {
    const response = await fetch(`${url}/api/${path}`, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    return { status: response.status, data: await response.json() };
  };
  return { ...instance, request, url, dataDir };
}

test("demo controls, scene CRUD, favorites, validation, and persistence across restarts", async (t) => {
  const app = await fixture(t);
  const initial = (await app.request()).data;
  assert.equal(initial.mode, "demo");
  assert.equal(initial.rooms.length, 6);
  const room = initial.rooms[0];
  const light = initial.lights.find((l) => l.roomId === room.id);
  let response = await app.request("lights", "POST", {
    ids: [light.id],
    settings: { on: true, brightness: 37, color: "#eeaabb", colorMode: "rgb" },
  });
  assert.equal(response.status, 200);
  assert.equal(
    (await app.request()).data.lights.find((l) => l.id === light.id).brightness,
    37,
  );
  const payload = {
    name: "Test movie night",
    roomId: room.id,
    palette: "sunset",
    lights: {
      [light.id]: {
        on: true,
        brightness: 31,
        color: "#aabbcc",
        colorMode: "rgb",
        kelvin: 2700,
      },
    },
  };
  const saved = (await app.request("scenes", "POST", payload)).data;
  assert.ok(saved.id);
  response = await app.request(`scenes/${saved.id}/activate`, "POST", {});
  assert.equal(response.status, 200);
  assert.equal(
    (await app.request()).data.lights.find((l) => l.id === light.id).color,
    "#aabbcc",
  );
  await app.request(`scenes/${saved.id}/favorite`, "POST", { favorite: true });
  await app.request(`scenes/${saved.id}`, "PUT", {
    ...payload,
    name: "Renamed scene",
  });
  const restored = await fixture(t, { dataDir: app.dataDir });
  const restoredScene = (await restored.request()).data.scenes.find(
    (s) => s.id === saved.id,
  );
  assert.equal(restoredScene.name, "Renamed scene");
  assert.equal(restoredScene.favorite, true);
  response = await app.request("lights", "POST", {
    ids: [light.id],
    settings: { brightness: 101 },
  });
  assert.equal(response.status, 400);
  response = await app.request("lights", "POST", {
    ids: ["switch.front_door"],
    settings: { on: true },
  });
  assert.equal(response.status, 400);
  response = await app.request("scenes", "POST", {
    ...payload,
    roomId: initial.rooms[1].id,
  });
  assert.equal(response.status, 400);
  assert.equal(
    (await app.request(`scenes/${saved.id}`, "DELETE", {})).status,
    200,
  );
  assert.equal(
    (await app.request()).data.scenes.some((s) => s.id === saved.id),
    false,
  );
});

const haStates = [
  {
    entity_id: "light.color",
    state: "on",
    attributes: {
      friendly_name: "Color lamp",
      brightness: 128,
      supported_color_modes: ["rgb"],
      rgb_color: [250, 180, 90],
    },
  },
  {
    entity_id: "light.white",
    state: "off",
    attributes: {
      friendly_name: "White lamp",
      supported_color_modes: ["color_temp"],
      min_color_temp_kelvin: 2500,
      max_color_temp_kelvin: 5000,
    },
  },
  {
    entity_id: "light.basic",
    state: "on",
    attributes: { supported_color_modes: ["onoff"] },
  },
  {
    entity_id: "light.unavailable",
    state: "unavailable",
    attributes: { supported_color_modes: ["brightness"] },
  },
  { entity_id: "light.hidden", state: "on", attributes: {} },
  {
    entity_id: "scene.evening",
    state: "unknown",
    attributes: {
      friendly_name: "Evening",
      entity_id: ["light.color", "light.white"],
    },
  },
];
const entities = [
  { entity_id: "light.color", device_id: "device-1" },
  { entity_id: "light.white", device_id: "device-2", area_id: "living" },
  { entity_id: "light.hidden", hidden_by: "user", area_id: "living" },
];
const areas = [
  { area_id: "living", name: "Living room" },
  { area_id: "kitchen", name: "Kitchen" },
];
const devices = [
  { id: "device-1", area_id: "living" },
  { id: "device-2", area_id: "kitchen" },
];

test("discovers entity and device Areas, unassigned lights, capabilities, and native scenes", () => {
  const mapped = mapHome(
    Object.fromEntries(haStates.map((s) => [s.entity_id, s])),
    areas,
    devices,
    entities,
    [],
  );
  assert.deepEqual(
    mapped.rooms.map((r) => r.id),
    ["living", "unassigned"],
  );
  assert.equal(
    mapped.lights.find((l) => l.id === "light.white").roomId,
    "living",
  );
  assert.equal(
    mapped.lights.find((l) => l.id === "light.basic").dimmable,
    false,
  );
  assert.equal(
    mapped.lights.find((l) => l.id === "light.unavailable").available,
    false,
  );
  assert.equal(
    mapped.lights.some((l) => l.id === "light.hidden"),
    false,
  );
  assert.equal(mapped.scenes[0].roomId, "living");
});

async function mockHa(t) {
  const states = structuredClone(haStates);
  const sceneConfigs = new Map();
  const configCalls = [];
  let configStatus = 200;
  const http = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, "Bearer test-token");
    assert.match(req.url, /^\/proxy\/api\/config\/scene\/config\/glow_/);
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    const id = decodeURIComponent(req.url.split("/").at(-1));
    configCalls.push({ method: req.method, id, body });
    res.setHeader("Content-Type", "application/json");
    if (configStatus !== 200) {
      res
        .writeHead(configStatus)
        .end(JSON.stringify({ message: "Scene configuration rejected" }));
      return;
    }
    const entityId = `scene.${id}`;
    const index = states.findIndex((s) => s.attributes?.id === id);
    let next = null;
    if (req.method === "POST") {
      sceneConfigs.set(id, body);
      next = {
        entity_id: index < 0 ? entityId : states[index].entity_id,
        state: "unknown",
        attributes: {
          id,
          friendly_name: body.name,
          entity_id: Object.keys(body.entities),
        },
      };
      if (index < 0) states.push(next);
      else states[index] = next;
    } else {
      sceneConfigs.delete(id);
      if (index >= 0) states.splice(index, 1);
    }
    for (const socket of wss.clients)
      socket.send(
        JSON.stringify({
          type: "event",
          event: {
            event_type: "state_changed",
            data: { entity_id: next?.entity_id ?? entityId, new_state: next },
          },
        }),
      );
    res.end(JSON.stringify({ result: "ok" }));
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await once(wss, "listening");
  const calls = [];
  let failServices = false;
  wss.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "auth_required" }));
    socket.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.type === "auth")
        return socket.send(
          JSON.stringify({
            type: m.access_token === "test-token" ? "auth_ok" : "auth_invalid",
          }),
        );
      if (m.type === "call_service") calls.push(m);
      const responses = {
        get_states: states,
        "config/area_registry/list": areas,
        "config/device_registry/list": devices,
        "config/entity_registry/list": entities,
      };
      socket.send(
        JSON.stringify({
          type: m.type === "ping" ? "pong" : "result",
          id: m.id,
          success: !(failServices && m.type === "call_service"),
          result: responses[m.type] ?? null,
          error: { message: "Light service failed" },
        }),
      );
    });
  });
  const ha = new HomeAssistant({
    url: `ws://127.0.0.1:${wss.address().port}`,
    apiUrl: `http://127.0.0.1:${http.address().port}/proxy/api/`,
    token: "test-token",
    retryMs: 20,
    timeoutMs: 1000,
  });
  t.after(async () => {
    ha.stop();
    for (const client of wss.clients) client.terminate();
    await new Promise((resolve) => wss.close(resolve));
    await new Promise((resolve) => http.close(resolve));
  });
  const ready = once(ha, "change");
  ha.start();
  await ready;
  assert.equal(ha.connected, true);
  return {
    ha,
    calls,
    wss,
    sceneConfigs,
    configCalls,
    configStatus(status) {
      configStatus = status;
    },
    fail() {
      failServices = true;
    },
  };
}

test("real WebSocket handshake, service targeting, capability filtering, scene application, and errors", async (t) => {
  const mock = await mockHa(t);
  const { request } = await fixture(t, { ha: mock.ha });
  assert.equal((await request()).data.mode, "live");
  let response = await request("lights", "POST", {
    ids: ["light.color", "light.white", "light.basic"],
    settings: {
      on: true,
      brightness: 50,
      colorMode: "color_temp",
      kelvin: 2000,
    },
  });
  assert.equal(response.status, 200);
  assert.equal(mock.calls.length, 3);
  assert.deepEqual(mock.calls[0].target.entity_id, ["light.color"]);
  assert.deepEqual(mock.calls[0].service_data, { brightness: 128 });
  assert.deepEqual(mock.calls[1].service_data, {
    brightness: 128,
    color_temp_kelvin: 2500,
  });
  assert.deepEqual(mock.calls[2].service_data, {});
  response = await request("lights", "POST", {
    ids: ["light.unavailable"],
    settings: { on: true },
  });
  assert.equal(response.status, 400);
  // A fade goes along with every value, and never with switching off.
  mock.calls.length = 0;
  response = await request("lights", "POST", {
    ids: ["light.color", "light.white"],
    settings: { brightness: 50 },
    transition: 0.3,
  });
  assert.equal(response.status, 200);
  assert.equal(mock.calls.length, 1);
  assert.deepEqual(mock.calls[0].service_data, {
    brightness: 128,
    transition: 0.3,
  });
  response = await request("lights", "POST", {
    ids: ["light.color"],
    settings: { on: false },
    transition: 0.3,
  });
  assert.deepEqual(mock.calls.at(-1).service_data, {});
  response = await request("lights", "POST", {
    ids: ["light.color"],
    settings: { brightness: 50 },
    transition: -1,
  });
  assert.equal(response.status, 400);
  const saved = (
    await request("scenes", "POST", {
      name: "Cozy",
      roomId: "living",
      palette: "warm",
      lights: {
        "light.color": {
          on: true,
          brightness: 60,
          color: "#aabbcc",
          colorMode: "rgb",
        },
        "light.white": { on: false },
      },
    })
  ).data;
  await request(`scenes/${saved.id}/activate`, "POST", {});
  const call = mock.calls.at(-1);
  assert.equal(call.domain, "scene");
  assert.equal(call.service, "turn_on");
  assert.equal(call.target.entity_id, `scene.${saved.haSceneId}`);
  assert.deepEqual(
    mock.sceneConfigs.get(saved.haSceneId).entities["light.color"],
    {
      state: "on",
      brightness: 153,
      rgb_color: [170, 187, 204],
    },
  );
  assert.deepEqual(
    mock.sceneConfigs.get(saved.haSceneId).entities["light.white"],
    { state: "off" },
  );
  await request("scenes/scene.evening/activate", "POST", {});
  assert.equal(mock.calls.at(-1).service, "turn_on");
  assert.equal(mock.calls.at(-1).target.entity_id, "scene.evening");
  assert.equal(
    (await request("scenes/scene.evening", "DELETE", {})).status,
    400,
  );
  mock.fail();
  response = await request("lights", "POST", {
    ids: ["light.color"],
    settings: { on: false },
  });
  assert.equal(response.status, 400);
  assert.match(response.data.error, /failed/);
  mock.ha.connected = false;
  response = await request("lights", "POST", {
    ids: ["light.color"],
    settings: { on: false },
  });
  assert.equal(response.status, 503);
});

test("live state events are streamed to clients, and reconnect reloads discovery", async (t) => {
  const { ha, wss } = await mockHa(t);
  const app = await fixture(t, { ha });
  const abort = new AbortController();
  const response = await fetch(`${app.url}/api/events`, {
    signal: abort.signal,
  });
  const reader = response.body.getReader();
  await reader.read();
  const updated = { ...haStates[0], state: "off" };
  for (const socket of wss.clients)
    socket.send(
      JSON.stringify({
        type: "event",
        event: {
          event_type: "state_changed",
          data: { entity_id: updated.entity_id, new_state: updated },
        },
      }),
    );
  const next = await reader.read();
  const data = JSON.parse(
    new TextDecoder()
      .decode(next.value)
      .trim()
      .replace(/^data: /, ""),
  );
  assert.equal(data.lights.find((l) => l.id === "light.color").on, false);
  abort.abort();
  const disconnected = once(ha, "change");
  for (const socket of wss.clients) socket.close();
  await disconnected;
  assert.equal(ha.connected, false);
  await once(ha, "change");
  assert.equal(ha.connected, true);
  assert.equal(ha.states["light.color"].state, "on");
});

async function openSocket(app, headers = {}, path = "/api/websocket") {
  const socket = new WebSocket(`${app.url.replace(/^http/, "ws")}${path}`, {
    headers,
  });
  const messages = [];
  const waiters = [];
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    const index = waiters.findIndex(({ match }) => match(message));
    if (index >= 0) waiters.splice(index, 1)[0].resolve(message);
    else messages.push(message);
  });
  const next = (match) => {
    const index = messages.findIndex(match);
    if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
    return new Promise((resolve) => waiters.push({ match, resolve }));
  };
  let nextId = 1;
  const command = (method, path, body) => {
    const id = nextId++;
    socket.send(JSON.stringify({ id, method, path, body }));
    return next((m) => m.type === "result" && m.id === id);
  };
  await once(socket, "open");
  return { socket, next, command };
}

test("WebSocket clients receive live state and run commands in order", async (t) => {
  const mock = await mockHa(t);
  const app = await fixture(t, { ha: mock.ha });
  const client = await openSocket(
    app,
    {},
    "/api/hassio_ingress/x/api/websocket",
  );
  t.after(() => client.socket.terminate());
  const initial = await client.next((m) => m.type === "state");
  assert.equal(
    initial.home.lights.find((l) => l.id === "light.color").on,
    true,
  );

  // A burst of state changes reaches clients as one coalesced update.
  for (const socket of mock.wss.clients)
    for (const brightness of [10, 20, 30])
      socket.send(
        JSON.stringify({
          type: "event",
          event: {
            event_type: "state_changed",
            data: {
              entity_id: "light.color",
              new_state: {
                ...haStates[0],
                attributes: { ...haStates[0].attributes, brightness },
              },
            },
          },
        }),
      );
  const burst = await client.next((m) => m.type === "state");
  assert.equal(
    burst.home.lights.find((l) => l.id === "light.color").brightness,
    12,
  );
  // Unrelated entities never trigger an update.
  for (const socket of mock.wss.clients)
    socket.send(
      JSON.stringify({
        type: "event",
        event: {
          event_type: "state_changed",
          data: {
            entity_id: "sensor.power",
            new_state: { entity_id: "sensor.power", state: "4" },
          },
        },
      }),
    );

  const results = await Promise.all(
    [20, 40, 60].map((brightness) =>
      client.command("POST", "lights", {
        ids: ["light.color"],
        settings: { on: true, brightness },
      }),
    ),
  );
  assert.deepEqual(
    results.map((r) => r.result),
    [{ ok: true }, { ok: true }, { ok: true }],
  );
  assert.deepEqual(
    mock.calls.map((c) => c.service_data.brightness),
    [51, 102, 153],
  );
  assert.equal(client.socket.readyState, WebSocket.OPEN);
  assert.equal(mock.ha.states["sensor.power"], undefined);

  const missing = await client.command("POST", "scenes/nope/activate", {});
  assert.equal(missing.status, 404);
  assert.match(missing.error, /no longer exists/);
  const invalid = await client.command("POST", "lights", { ids: [] });
  assert.equal(invalid.status, 400);
  mock.fail();
  const failed = await client.command("POST", "lights", {
    ids: ["light.color"],
    settings: { on: false },
  });
  assert.match(failed.error, /failed/);
  client.socket.send("not json");
  const [code] = await once(client.socket, "close");
  assert.equal(code, 1003);
});

test("WebSocket upgrades reject other sites and direct ingress access", async (t) => {
  const app = await fixture(t);
  const refused = async (headers, target = app) => {
    const socket = new WebSocket(
      `${target.url.replace(/^http/, "ws")}/api/websocket`,
      { headers },
    );
    socket.on("error", () => {});
    const [, response] = await once(socket, "unexpected-response");
    socket.terminate();
    return response.statusCode;
  };
  assert.equal(await refused({ Origin: "https://evil.example" }), 403);
  assert.equal(await refused({ "Sec-Fetch-Site": "cross-site" }), 403);
  const same = await openSocket(app, { Origin: app.url });
  same.socket.terminate();
  const proxied = await openSocket(app, {
    Origin: "https://ha.example",
    "X-Forwarded-Host": "ha.example",
  });
  proxied.socket.terminate();
  const ingress = await fixture(t, { ingress: true });
  assert.equal(await refused({}, ingress), 403);
});

test("ingress blocks direct access; mutations reject cross-site and non-JSON requests", async (t) => {
  const ingress = await fixture(t, { ingress: true });
  assert.equal((await ingress.request()).status, 403);
  const app = await fixture(t);
  const crossSite = await fetch(`${app.url}/api/lights`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "cross-site",
    },
    body: "{}",
  });
  assert.equal(crossSite.status, 403);
  const form = await fetch(`${app.url}/api/lights`, {
    method: "POST",
    body: "on=true",
  });
  assert.equal(form.status, 415);
});

test("published scenes persist, deduplicate, update and delete in Home Assistant", async (t) => {
  const mock = await mockHa(t);
  const app = await fixture(t, { ha: mock.ha });
  const payload = {
    name: "Persistent evening",
    roomId: "living",
    palette: "warm",
    lights: {
      "light.color": {
        on: true,
        brightness: 45,
        color: "#123456",
        colorMode: "rgb",
      },
      "light.white": { on: true, kelvin: 2000, colorMode: "color_temp" },
    },
  };
  const created = await app.request("scenes", "POST", payload);
  assert.equal(created.status, 201);
  const scene = created.data;
  assert.equal(mock.calls.length, 0, "Saving must not activate lights");
  assert.equal(mock.configCalls.length, 1);
  assert.equal(
    mock.sceneConfigs.get(scene.haSceneId).entities["light.white"]
      .color_temp_kelvin,
    2500,
  );
  const matching = () =>
    app.state().scenes.filter((s) => s.haSceneId === scene.haSceneId);
  assert.equal(matching().length, 1);
  await app.request(`scenes/${scene.id}/favorite`, "POST", { favorite: true });
  assert.equal(
    (
      await app.request(`scenes/${scene.id}`, "PUT", {
        ...payload,
        name: "Renamed evening",
      })
    ).status,
    200,
  );
  assert.equal(mock.sceneConfigs.size, 1);
  assert.equal(mock.sceneConfigs.get(scene.haSceneId).name, "Renamed evening");
  assert.equal(matching()[0].favorite, true);
  const restored = await fixture(t, { dataDir: app.dataDir, ha: mock.ha });
  assert.equal(
    restored.state().scenes.filter((s) => s.haSceneId === scene.haSceneId)
      .length,
    1,
  );
  // A client without Glow metadata still discovers a real, activatable scene.
  const other = await fixture(t, { ha: mock.ha });
  const native = other
    .state()
    .scenes.find((s) => s.haSceneId === scene.haSceneId);
  assert.equal(native.source, "home-assistant");
  assert.equal(native.roomId, "living");
  assert.equal(
    (await other.request(`scenes/${native.id}/activate`, "POST", {})).status,
    200,
  );
  // Entity names can change independently of a scene's stable config ID.
  const state = mock.ha.states[native.entityId];
  delete mock.ha.states[native.entityId];
  mock.ha.states["scene.renamed_by_user"] = {
    ...state,
    entity_id: "scene.renamed_by_user",
  };
  await app.request(`scenes/${scene.id}/activate`, "POST", {});
  assert.equal(mock.calls.at(-1).target.entity_id, "scene.renamed_by_user");
  assert.equal(
    (await app.request(`scenes/${scene.id}`, "DELETE", {})).status,
    200,
  );
  assert.equal(mock.sceneConfigs.size, 0);
  assert.equal(matching().length, 0);
  assert.equal(mock.configCalls.at(-1).method, "DELETE");
});

test("rejected scene writes restore local state and disconnected saves do not pretend to succeed", async (t) => {
  const mock = await mockHa(t);
  const app = await fixture(t, { ha: mock.ha });
  const payload = {
    name: "Keep my scene",
    roomId: "living",
    palette: "warm",
    lights: { "light.color": { on: true } },
  };
  mock.configStatus(403);
  const failure = await app.request("scenes", "POST", payload);
  assert.equal(failure.status, 400);
  assert.match(failure.data.error, /administrator/);
  assert.equal(app.state().scenes.filter((s) => s.source === "glow").length, 0);
  mock.configStatus(200);
  const { data: scene } = await app.request("scenes", "POST", payload);
  mock.configStatus(500);
  assert.equal(
    (
      await app.request(`scenes/${scene.id}`, "PUT", {
        ...payload,
        name: "Should not stick",
      })
    ).status,
    400,
  );
  assert.equal(
    (await app.request(`scenes/${scene.id}`, "DELETE", {})).status,
    400,
  );
  assert.equal(
    app.state().scenes.find((s) => s.id === scene.id).name,
    payload.name,
  );
  assert.equal(mock.sceneConfigs.get(scene.haSceneId).name, payload.name);
  const count = mock.configCalls.length;
  mock.ha.connected = false;
  assert.equal((await app.request("scenes", "POST", payload)).status, 503);
  assert.equal(
    (await app.request(`scenes/${scene.id}`, "PUT", payload)).status,
    503,
  );
  assert.equal(
    (await app.request(`scenes/${scene.id}`, "DELETE", {})).status,
    503,
  );
  assert.equal(mock.configCalls.length, count);
});

test("hashed assets are cached for good while the page is always revalidated", async (t) => {
  const distDir = mkdtempSync(join(tmpdir(), "glow-dist-"));
  t.after(() => rmSync(distDir, { recursive: true, force: true }));
  mkdirSync(join(distDir, "assets"));
  writeFileSync(
    join(distDir, "index.html"),
    "<!doctype html><title>Glow</title>",
  );
  writeFileSync(join(distDir, "assets", "index-a1b2c3.js"), "export {};");
  const app = await fixture(t, { distDir });

  const asset = await fetch(`${app.url}/assets/index-a1b2c3.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("cache-control"), /max-age=31536000/);
  assert.match(asset.headers.get("cache-control"), /immutable/);
  assert.equal(asset.headers.get("x-content-type-options"), "nosniff");

  const page = await fetch(`${app.url}/`);
  assert.equal(page.status, 200);
  assert.doesNotMatch(page.headers.get("cache-control") ?? "", /immutable/);

  // A stale asset from an older build is a clean 404, not the HTML page.
  const missing = await fetch(`${app.url}/assets/index-old.js`);
  assert.equal(missing.status, 404);
  assert.doesNotMatch(await missing.text(), /<title>/);
});
