/**
 * Auth API client.
 *
 * Mirrors the backend auth routes (mounted at /api/v1/auth):
 *   register → POST /auth/register  → { user, store, accessToken, refreshToken }
 *   login    → POST /auth/login     → { user, store, accessToken, refreshToken }
 *   refresh  → POST /auth/refresh    (handled inside lib/http.ts)
 *   logout   → POST /auth/logout    → { loggedOut }
 *   me       → GET  /auth/me        → { user, store, roles, permissions }
 */

import { apiRequest } from "./http";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthStore {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  user: AuthUser;
  store: AuthStore;
  accessToken: string;
  refreshToken: string;
}

export interface MeResult {
  user: AuthUser;
  store: AuthStore | null;
  roles: string[];
  permissions: string[];
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  storeName: string;
}

export function login(input: LoginInput): Promise<AuthSession> {
  return apiRequest<AuthSession>("/auth/login", {
    method: "POST",
    body: input,
    auth: false,
  });
}

export function register(input: RegisterInput): Promise<AuthSession> {
  return apiRequest<AuthSession>("/auth/register", {
    method: "POST",
    body: input,
    auth: false,
  });
}

export function fetchMe(): Promise<MeResult> {
  return apiRequest<MeResult>("/auth/me", { method: "GET" });
}

export function logout(refreshToken: string): Promise<{ loggedOut: boolean }> {
  return apiRequest<{ loggedOut: boolean }>("/auth/logout", {
    method: "POST",
    body: { refreshToken },
    auth: false,
  });
}
