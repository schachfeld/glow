import { connectionUrl } from "./connection.mjs";

// One Home Assistant can be reached at several addresses, such as the home
// network, Tailscale or another VPN, or a public address. They share the
// sign-in: Home Assistant's tokens belong to the instance, not to an address.
// `url` stays the address the person signed in with and keys local data;
// `routes` is the order Glow tries them in.

export function connectionRoutes(connection) {
  const routes = Array.isArray(connection.routes) ? connection.routes : [];
  const list = routes.length ? routes : [connection.url];
  const unique = [];
  for (const route of list) {
    const url = connectionUrl(route);
    if (!unique.includes(url)) unique.push(url);
  }
  return unique;
}

export function addRoute(routes, input) {
  const url = connectionUrl(input);
  if (routes.includes(url))
    throw new Error("This address is already in the list.");
  return [...routes, url];
}

export function moveRoute(routes, url, offset) {
  const from = routes.indexOf(url);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= routes.length) return routes;
  const next = [...routes];
  next.splice(from, 1);
  next.splice(to, 0, url);
  return next;
}

export function removeRoute(routes, url) {
  if (routes.length < 2)
    throw new Error("Keep at least one address for your Home Assistant.");
  return routes.filter((route) => route !== url);
}

// Probes every route at once and resolves the earliest one in the list that
// answers. Once any route has answered, earlier routes that are still silent
// get `graceMs` more before they are skipped, so an unreachable home address
// away from home costs little. Resolves null when none answer.
export function pickRoute(
  routes,
  probe,
  { timeoutMs = 4000, graceMs = 750 } = {},
) {
  return new Promise((resolve) => {
    if (!routes.length) return resolve(null);
    const results = routes.map(() => undefined);
    let done = false;
    let grace;
    const timers = [];
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(grace);
      for (const timer of timers) clearTimeout(timer);
      resolve(value);
    };
    const decide = (force = false) => {
      for (let index = 0; index < routes.length; index++) {
        if (results[index] === true) return finish(routes[index]);
        if (results[index] === undefined && !force) {
          if (results.includes(true) && grace === undefined)
            grace = setTimeout(() => decide(true), graceMs);
          return;
        }
      }
      if (results.every((result) => result !== undefined) || force)
        finish(null);
    };
    routes.forEach((route, index) => {
      const settle = (ok) => {
        if (results[index] !== undefined) return;
        results[index] = ok;
        decide();
      };
      timers.push(setTimeout(() => settle(false), timeoutMs));
      Promise.resolve()
        .then(() => probe(route))
        .then(
          (ok) => settle(Boolean(ok)),
          () => settle(false),
        );
    });
  });
}
