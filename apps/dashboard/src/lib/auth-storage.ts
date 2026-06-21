/**
 * Persists the JWT access + refresh tokens for the dashboard session.
 *
 * Tokens live in localStorage so a page refresh keeps the user signed in. The
 * HTTP client (lib/http.ts) reads the access token for every authenticated
 * request and rotates both tokens after a successful refresh.
 */

const ACCESS_TOKEN_KEY = "saas.accessToken";
const REFRESH_TOKEN_KEY = "saas.refreshToken";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(tokens: StoredTokens): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function hasTokens(): boolean {
  return getAccessToken() !== null && getRefreshToken() !== null;
}
