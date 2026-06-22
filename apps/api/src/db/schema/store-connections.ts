import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";

/** Lifecycle of a store's WordPress/WooCommerce connection. */
export const CONNECTION_STATUSES = [
  "disconnected",
  "pending",
  "connected",
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/**
 * One connection per store (tenant) to its WordPress/WooCommerce site. Holds the
 * connector API key material (never the raw key — only a SHA-256 hash plus a
 * public lookup id) and the last-known site/health metadata.
 */
export const storeConnections = pgTable(
  "store_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant scope: a store has at most one connection.
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("disconnected"),
    // Public, non-secret id used to locate the row when verifying a presented
    // key. Null until a key has been generated.
    apiKeyId: text("api_key_id"),
    // SHA-256 hex hash of the key's secret. The raw key is never persisted.
    apiKeyHash: text("api_key_hash"),
    // Non-secret display prefix (e.g. "wpc_ab12...") for the dashboard.
    apiKeyPrefix: text("api_key_prefix"),
    apiKeyGeneratedAt: timestamp("api_key_generated_at", {
      withTimezone: true,
    }),
    // Encrypted-at-rest copy of the FULL plaintext key, used ONLY to sign
    // outbound SaaS -> WordPress requests (the connector verifies that signature
    // with the same key). AES-256-GCM ciphertext, iv and auth tag are stored
    // separately; all three are null when outbound delivery is not configured
    // (CONNECTOR_ENCRYPTION_KEY unset) or the key was issued before this column
    // existed. The inbound-verification hash above is still the source of truth
    // for authenticating the connector; this is the reverse direction only.
    apiKeyCipher: text("api_key_cipher"),
    apiKeyIv: text("api_key_iv"),
    apiKeyTag: text("api_key_tag"),
    // Last successful data sync (any entity) with WooCommerce.
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    // Reported by the WordPress site on connect (sanitized client + server side).
    siteUrl: text("site_url"),
    wpVersion: text("wp_version"),
    wcVersion: text("wc_version"),
    connectorVersion: text("connector_version"),
    lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
    lastHealthCheckAt: timestamp("last_health_check_at", {
      withTimezone: true,
    }),
    lastHealthStatus: text("last_health_status"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    storeUnique: uniqueIndex("store_connections_store_unique").on(
      table.storeId,
    ),
    // NULL api_key_id values do not conflict, so unrevoked-only keys stay unique.
    apiKeyIdUnique: uniqueIndex("store_connections_api_key_id_unique").on(
      table.apiKeyId,
    ),
  }),
);

export type StoreConnectionRow = typeof storeConnections.$inferSelect;
export type NewStoreConnectionRow = typeof storeConnections.$inferInsert;
