import { fetch } from "expo/fetch";
import {
  connectionUrl,
  type AccessGrant,
  type SceneRequest,
  type TokenRequest,
} from "../core";

type Failure = Error & { reauthenticate?: boolean };
const failure = (message: string, reauthenticate = false): Failure =>
  Object.assign(new Error(message), { reauthenticate });

// Requests never follow redirects, so a sign-in code, refresh token or access
// token is only ever sent to the Home Assistant address the person entered.
async function request(
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// Why a request failed, as the system reports it, so a blocked or refused
// connection is not mistaken for a network that is down.
function reason(cause: unknown, timeoutMs: number) {
  if ((cause as Error)?.name === "AbortError")
    return ` (no answer after ${timeoutMs / 1000} seconds)`;
  const message = cause instanceof Error ? cause.message.trim() : "";
  return message ? ` (${message.replace(/\.$/, "")})` : "";
}

function tokenEndpoint(base: string) {
  try {
    return new URL("auth/token", connectionUrl(base)).href;
  } catch {
    throw failure(
      "Use a Home Assistant HTTP or HTTPS address without embedded credentials.",
    );
  }
}

export async function requestToken(input: TokenRequest): Promise<AccessGrant> {
  const endpoint = tokenEndpoint(input.baseUrl);
  const credential =
    input.grantType === "authorization_code"
      ? (["code", input.code] as const)
      : input.grantType === "refresh_token"
        ? (["refresh_token", input.refreshToken] as const)
        : null;
  if (!credential) throw failure("Unsupported sign-in request.");
  if (!credential[1])
    throw failure(
      "The sign-in credential is missing. Please sign in again.",
      true,
    );
  let response;
  try {
    response = await request(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: input.grantType,
          client_id: input.clientId,
          [credential[0]]: credential[1],
        }).toString(),
      },
      15000,
    );
  } catch (cause) {
    throw failure(
      `${
        input.grantType === "authorization_code"
          ? "Cannot reach Home Assistant to finish signing in."
          : "Cannot reach Home Assistant to renew your sign-in."
      } Check your connection and try again.${reason(cause, 15000)}`,
    );
  }
  if ([400, 401, 403].includes(response.status))
    throw failure(
      "Your Home Assistant sign-in is no longer valid. Please sign in again.",
      true,
    );
  if (response.status < 200 || response.status >= 300)
    throw failure(
      "Home Assistant could not complete sign-in. Check your address and try again.",
    );
  let token: {
    access_token?: unknown;
    expires_in?: unknown;
    refresh_token?: unknown;
  };
  try {
    token = await response.json();
  } catch {
    throw failure("Home Assistant returned an invalid sign-in response.");
  }
  if (
    typeof token?.access_token !== "string" ||
    !token.access_token ||
    typeof token.expires_in !== "number" ||
    !(token.expires_in > 0 && token.expires_in <= 31_536_000)
  )
    throw failure("Home Assistant returned an invalid access token.");
  return {
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    refreshToken:
      typeof token.refresh_token === "string" ? token.refresh_token : undefined,
  };
}

// Whether Home Assistant answers at this address. The login providers
// endpoint needs no sign-in, so probing never counts as a failed login in
// Home Assistant's IP ban protection.
export async function probeRoute(base: string, timeoutMs = 4000) {
  try {
    const response = await request(
      new URL("auth/providers", connectionUrl(base)).href,
      { method: "GET" },
      timeoutMs,
    );
    return response.ok;
  } catch {
    return false;
  }
}

// Whether this address leads to the same Home Assistant: access tokens are
// signed by the instance that issued them, so another instance rejects them.
export async function verifyRoute(base: string, accessToken: string) {
  let response;
  try {
    response = await request(
      new URL("api/", connectionUrl(base)).href,
      { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } },
      10000,
    );
  } catch {
    throw new Error(
      "Glow could not reach Home Assistant over this route. Connect to the network or VPN it belongs to, then try again.",
    );
  }
  if (response.status === 401 || response.status === 403)
    throw new Error(
      "This route leads to a different Home Assistant, or it rejected your sign-in. Check the address.",
    );
  let body: { message?: unknown } | null = null;
  try {
    body = response.ok ? await response.json() : null;
  } catch {
    // Reported below.
  }
  if (body?.message !== "API running.")
    throw new Error(
      "Home Assistant did not answer over this route. Check the address and try again.",
    );
}

// Only Home Assistant's scene and automation configuration endpoints may be
// called, with an id Glow creates itself.
export function sceneEndpoint(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Invalid Home Assistant address.");
  }
  const id = url.pathname.split(
    /\/api\/config\/(?:scene|automation)\/config\//,
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    id.length < 2 ||
    !/^[A-Za-z0-9_-]+$/.test(id[id.length - 1])
  )
    throw new Error("Invalid Home Assistant configuration endpoint.");
  return url.href;
}

export async function sceneRequest(input: SceneRequest) {
  if (!["POST", "DELETE"].includes(input.method))
    throw new Error("Unsupported scene request.");
  const endpoint = sceneEndpoint(input.url);
  let response;
  try {
    response = await request(
      endpoint,
      {
        method: input.method,
        headers: {
          Authorization: `Bearer ${input.token}`,
          ...(input.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      },
      Math.min(30000, Math.max(1000, input.timeoutMs)),
    );
  } catch {
    throw new Error(
      "Could not reach Home Assistant to save the scene. Check your connection and try again.",
    );
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not every response has a JSON body.
  }
  return { status: response.status, body };
}
