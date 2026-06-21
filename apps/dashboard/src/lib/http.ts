/**
 * Thin fetch wrapper for the backend API.
 *
 * Responsibilities:
 *   - prefix requests with `${VITE_API_URL}/api/v1`
 *   - attach the Bearer access token to authenticated calls
 *   - unwrap the success envelope ({ success, data, message }) to `data`
 *   - throw a typed `ApiError` carrying the backend error code + message
 *   - on a 401, refresh the token once and retry; if refresh fails, clear the
 *     session and broadcast `auth:logout` so the AuthProvider can redirect
 */

import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "./auth-storage";

const API_ORIGIN = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const API_BASE = `${API_ORIGIN}/api/v1`;

/** Dispatched when the session can no longer be refreshed. */
export const AUTH_LOGOUT_EVENT = "auth:logout";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  message: string;
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Attach the Bearer token and enable 401-refresh retry. Defaults to true. */
  auth?: boolean;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function rawRequest(
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as Envelope<T> | null;

  if (response.ok && body && body.success) {
    return body.data;
  }

  if (body && body.success === false) {
    throw new ApiError(
      response.status,
      body.error.code,
      body.error.message,
      body.error.details,
    );
  }

  throw new ApiError(
    response.status,
    "HTTP_ERROR",
    `حدث خطأ غير متوقع (${response.status}).`,
  );
}

// One refresh at a time: concurrent 401s share a single refresh round-trip.
let refreshInFlight: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }

  try {
    const response = await rawRequest(
      "/auth/refresh",
      { method: "POST", body: { refreshToken } },
      null,
    );
    if (!response.ok) {
      return false;
    }
    const body = (await response.json().catch(() => null)) as Envelope<{
      accessToken: string;
      refreshToken: string;
    }> | null;
    if (!body || !body.success) {
      return false;
    }
    setTokens({
      accessToken: body.data.accessToken,
      refreshToken: body.data.refreshToken,
    });
    return true;
  } catch {
    return false;
  }
}

function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function forceLogout(): void {
  clearTokens();
  window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT));
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const withAuth = options.auth ?? true;

  const response = await rawRequest(
    path,
    options,
    withAuth ? getAccessToken() : null,
  );

  if (response.status !== 401 || !withAuth) {
    return parseEnvelope<T>(response);
  }

  const refreshed = await tryRefresh();
  if (!refreshed) {
    forceLogout();
    throw new ApiError(
      401,
      "SESSION_EXPIRED",
      "انتهت الجلسة. يرجى تسجيل الدخول من جديد.",
    );
  }

  const retry = await rawRequest(path, options, getAccessToken());
  return parseEnvelope<T>(retry);
}
