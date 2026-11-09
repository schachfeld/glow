export const REDIRECT_URI: string;
export const DEFAULT_CLIENT_ID: string;
export const LOGIN_LIFETIME: number;
export interface PendingLogin {
  url: string;
  clientId: string;
  redirectUri: string;
  state: string;
  createdAt: number;
}
export interface OAuthConnection {
  url: string;
  clientId: string;
  refreshToken: string;
  // Every address this Home Assistant answers at, in the order Glow tries them.
  routes?: string[];
  // Addresses Glow found and the person removed, so they are not added again.
  dismissedRoutes?: string[];
}
export type Connection =
  | {
      url: string;
      token: string;
      routes?: string[];
      dismissedRoutes?: string[];
    }
  | OAuthConnection;
export interface AccessGrant {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
}
export interface TokenRequest {
  baseUrl: string;
  clientId: string;
  grantType: "authorization_code" | "refresh_token";
  code?: string;
  refreshToken?: string;
}
export function createLogin(
  baseUrl: string,
  clientId?: string,
  now?: number,
): PendingLogin;
export function authorizeUrl(login: PendingLogin): string;
export function isLoginCallback(value: string): boolean;
export function callbackCode(
  value: string,
  login: PendingLogin | null,
  now?: number,
): string;
export function tokenProvider(
  connection: Connection,
  request: (request: TokenRequest) => Promise<AccessGrant>,
  initialGrant?: AccessGrant,
): () => Promise<string>;
