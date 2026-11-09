import test from "node:test";
import assert from "node:assert/strict";
import {
  addRoute,
  connectionRoutes,
  moveRoute,
  pickRoute,
  removeRoute,
} from "../packages/core/routes.mjs";

const home = "http://192.168.1.5:8123/";
const vpn = "http://100.101.102.103:8123/";
const remote = "https://home.example/";

test("a connection without routes uses its sign-in address", () => {
  assert.deepEqual(connectionRoutes({ url: home, token: "t" }), [home]);
  assert.deepEqual(
    connectionRoutes({
      url: home,
      token: "t",
      routes: [vpn, "http://192.168.1.5:8123", vpn],
    }),
    [vpn, home],
  );
});

test("routes are added once, reordered and kept non-empty", () => {
  const routes = addRoute([home], " http://100.101.102.103:8123 ");
  assert.deepEqual(routes, [home, vpn]);
  assert.throws(() => addRoute(routes, vpn), /already/);
  assert.throws(() => addRoute(routes, "ftp://x"), /http/);
  assert.deepEqual(moveRoute(routes, vpn, -1), [vpn, home]);
  assert.deepEqual(moveRoute(routes, vpn, 1), routes);
  assert.deepEqual(removeRoute(routes, home), [vpn]);
  assert.throws(() => removeRoute([vpn], vpn), /at least one/);
});

const delay = (ms, value) =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

test("the earliest answering route wins, even when a later one is faster", async () => {
  const probe = (route) => (route === home ? delay(60, true) : delay(5, true));
  assert.equal(await pickRoute([home, vpn], probe, { graceMs: 200 }), home);
});

test("a silent earlier route is skipped after the grace period", async () => {
  const started = Date.now();
  const probe = (route) =>
    route === home ? new Promise(() => {}) : delay(5, true);
  assert.equal(
    await pickRoute([home, vpn, remote], probe, {
      timeoutMs: 5000,
      graceMs: 50,
    }),
    vpn,
  );
  assert.ok(Date.now() - started < 1000);
});

test("failed routes are skipped and no answer resolves null", async () => {
  const probe = (route) =>
    route === remote ? delay(5, true) : Promise.reject(new Error("down"));
  assert.equal(await pickRoute([home, vpn, remote], probe), remote);
  assert.equal(
    await pickRoute([home, vpn], () => new Promise(() => {}), {
      timeoutMs: 30,
    }),
    null,
  );
  assert.equal(await pickRoute([], () => true), null);
});
