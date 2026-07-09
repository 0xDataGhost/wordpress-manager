import type { StoreConnectionRow } from "../../db/schema/store-connections";

/**
 * Public view of a store connection. Deliberately omits all key material
 * (hash, lookup id) — only the non-secret display prefix and status are exposed.
 */
export interface ConnectionStatusDto {
  storeId: string;
  status: string;
  hasApiKey: boolean;
  apiKeyPrefix: string | null;
  apiKeyGeneratedAt: Date | null;
  siteUrl: string | null;
  wpVersion: string | null;
  wcVersion: string | null;
  connectorVersion: string | null;
  connectorCapabilities: string[];
  lastConnectedAt: Date | null;
  lastHealthCheckAt: Date | null;
  lastHealthStatus: string | null;
  lastSyncAt: Date | null;
  updatedAt: Date;
}

export function toConnectionStatusDto(
  row: StoreConnectionRow,
): ConnectionStatusDto {
  return {
    storeId: row.storeId,
    status: row.status,
    hasApiKey: row.apiKeyId !== null,
    apiKeyPrefix: row.apiKeyPrefix,
    apiKeyGeneratedAt: row.apiKeyGeneratedAt,
    siteUrl: row.siteUrl,
    wpVersion: row.wpVersion,
    wcVersion: row.wcVersion,
    connectorVersion: row.connectorVersion,
    connectorCapabilities: Array.isArray(row.connectorCapabilities)
      ? (row.connectorCapabilities as string[])
      : [],
    lastConnectedAt: row.lastConnectedAt,
    lastHealthCheckAt: row.lastHealthCheckAt,
    lastHealthStatus: row.lastHealthStatus,
    lastSyncAt: row.lastSyncAt,
    updatedAt: row.updatedAt,
  };
}

/** Default DTO for a store that has never created a connection row. */
export function disconnectedStatusDto(storeId: string): ConnectionStatusDto {
  return {
    storeId,
    status: "disconnected",
    hasApiKey: false,
    apiKeyPrefix: null,
    apiKeyGeneratedAt: null,
    siteUrl: null,
    wpVersion: null,
    wcVersion: null,
    connectorVersion: null,
    connectorCapabilities: [],
    lastConnectedAt: null,
    lastHealthCheckAt: null,
    lastHealthStatus: null,
    lastSyncAt: null,
    updatedAt: new Date(0),
  };
}
