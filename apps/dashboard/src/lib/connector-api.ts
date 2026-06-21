/**
 * Connector API client for the WordPress connection flow.
 *
 * Only two actions are driven by the dashboard (JWT-authenticated); the actual
 * connect/verify handshake is performed by the WordPress plugin using its API
 * key, and the dashboard reflects the result by re-reading the status:
 *   fetchConnectionStatus → GET  /wp/connection-status       (JWT, settings.view)
 *   generateApiKey        → POST /stores/current/api-key      (JWT, settings.edit)
 *   disconnectStore       → POST /stores/current/disconnect   (JWT, settings.edit)
 *
 * Dates arrive as ISO strings over JSON, so the *At fields are typed as strings.
 */

import { apiRequest } from "./http";

export type ConnectionStatus = "disconnected" | "pending" | "connected";
export type HealthStatus = "ok" | "failed" | null;

export interface ConnectionStatusDto {
  storeId: string;
  status: ConnectionStatus;
  hasApiKey: boolean;
  apiKeyPrefix: string | null;
  apiKeyGeneratedAt: string | null;
  siteUrl: string | null;
  wpVersion: string | null;
  wcVersion: string | null;
  connectorVersion: string | null;
  lastConnectedAt: string | null;
  lastHealthCheckAt: string | null;
  lastHealthStatus: HealthStatus;
  updatedAt: string | null;
}

export interface GeneratedApiKey {
  /** Plaintext key — returned exactly once, never retrievable again. */
  apiKey: string;
  apiKeyPrefix: string;
  status: ConnectionStatus;
  generatedAt: string;
}

/** Reads the current store's connection status (no secret key material). */
export function fetchConnectionStatus(): Promise<ConnectionStatusDto> {
  return apiRequest<ConnectionStatusDto>("/wp/connection-status", {
    method: "GET",
  });
}

/**
 * Generates a new connector API key, invalidating any previous one and moving
 * the connection to "pending" until the WordPress plugin completes the connect.
 */
export function generateApiKey(): Promise<GeneratedApiKey> {
  return apiRequest<GeneratedApiKey>("/stores/current/api-key", {
    method: "POST",
  });
}

/** Revokes the key and resets the connection. Returns the updated status. */
export function disconnectStore(): Promise<ConnectionStatusDto> {
  return apiRequest<ConnectionStatusDto>("/stores/current/disconnect", {
    method: "POST",
  });
}
