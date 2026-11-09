import type { Connection } from "./auth.mjs";
export function connectionRoutes(connection: Connection): string[];
export function addRoute(routes: string[], input: string): string[];
export function moveRoute(
  routes: string[],
  url: string,
  offset: number,
): string[];
export function removeRoute(routes: string[], url: string): string[];
export function pickRoute(
  routes: string[],
  probe: (route: string) => Promise<boolean>,
  options?: { timeoutMs?: number; graceMs?: number },
): Promise<string | null>;
