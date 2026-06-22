import { eq } from "drizzle-orm";
import { db } from "../../db";
import {
  storeConnections,
  type StoreConnectionRow,
} from "../../db/schema/store-connections";
import { generateApiKey } from "../../lib/api-key";
import { encryptSecret } from "../../lib/connector-crypto";

/** Returns the connection row for a store, or null when none exists yet. */
export async function getConnectionByStoreId(
  storeId: string,
): Promise<StoreConnectionRow | null> {
  const [row] = await db
    .select()
    .from(storeConnections)
    .where(eq(storeConnections.storeId, storeId))
    .limit(1);
  return row ?? null;
}

/** Ensures a (disconnected) connection row exists for a store and returns it. */
export async function ensureConnection(
  storeId: string,
): Promise<StoreConnectionRow> {
  const existing = await getConnectionByStoreId(storeId);
  if (existing) return existing;

  const [created] = await db
    .insert(storeConnections)
    .values({ storeId })
    .returning();
  if (!created) {
    throw new Error("Failed to create store connection");
  }
  return created;
}

/** Locates a connection by its public API-key lookup id (for verification). */
export async function getConnectionByApiKeyId(
  apiKeyId: string,
): Promise<StoreConnectionRow | null> {
  const [row] = await db
    .select()
    .from(storeConnections)
    .where(eq(storeConnections.apiKeyId, apiKeyId))
    .limit(1);
  return row ?? null;
}

export interface IssuedApiKey {
  /** Plaintext key — returned to the dashboard user exactly once. */
  plaintext: string;
  connection: StoreConnectionRow;
}

/**
 * Generates a new connector API key for a store, invalidating any previous one.
 * Only the hash and public lookup id are stored. Issuing (or re-issuing) a key
 * moves the connection to "pending" until the WordPress site completes /wp/connect.
 */
export async function issueApiKey(storeId: string): Promise<IssuedApiKey> {
  await ensureConnection(storeId);
  const key = generateApiKey();

  // Encrypt the FULL plaintext key at rest so the SaaS can later sign outbound
  // requests to WordPress (publish + pull sync). Returns null when outbound
  // encryption is not configured, in which case no cipher material is stored and
  // outbound delivery stays disabled. The inbound-verification hash is always
  // stored regardless.
  const encrypted = encryptSecret(key.plaintext);

  const [updated] = await db
    .update(storeConnections)
    .set({
      apiKeyId: key.keyId,
      apiKeyHash: key.secretHash,
      apiKeyPrefix: key.displayPrefix,
      apiKeyGeneratedAt: new Date(),
      apiKeyCipher: encrypted?.cipher ?? null,
      apiKeyIv: encrypted?.iv ?? null,
      apiKeyTag: encrypted?.tag ?? null,
      status: "pending",
      updatedAt: new Date(),
    })
    .where(eq(storeConnections.storeId, storeId))
    .returning();

  if (!updated) {
    throw new Error("Failed to issue API key");
  }
  return { plaintext: key.plaintext, connection: updated };
}

export interface ConnectSiteInput {
  siteUrl: string;
  wpVersion?: string;
  wcVersion?: string;
  connectorVersion?: string;
}

/** Marks a connection connected and records the reported site metadata. */
export async function markConnected(
  connectionId: string,
  site: ConnectSiteInput,
): Promise<StoreConnectionRow> {
  const now = new Date();
  const [updated] = await db
    .update(storeConnections)
    .set({
      status: "connected",
      siteUrl: site.siteUrl,
      wpVersion: site.wpVersion ?? null,
      wcVersion: site.wcVersion ?? null,
      connectorVersion: site.connectorVersion ?? null,
      lastConnectedAt: now,
      lastHealthCheckAt: now,
      lastHealthStatus: "ok",
      updatedAt: now,
    })
    .where(eq(storeConnections.id, connectionId))
    .returning();

  if (!updated) {
    throw new Error("Failed to update connection");
  }
  return updated;
}

/** Records a successful credential/health verification from the connector. */
export async function recordHealthCheck(
  connectionId: string,
): Promise<StoreConnectionRow> {
  const now = new Date();
  const [updated] = await db
    .update(storeConnections)
    .set({ lastHealthCheckAt: now, lastHealthStatus: "ok", updatedAt: now })
    .where(eq(storeConnections.id, connectionId))
    .returning();

  if (!updated) {
    throw new Error("Failed to record health check");
  }
  return updated;
}

/** Stamps the connection's last successful data sync (any entity). */
export async function touchLastSync(storeId: string): Promise<void> {
  const now = new Date();
  await db
    .update(storeConnections)
    .set({ lastSyncAt: now, updatedAt: now })
    .where(eq(storeConnections.storeId, storeId));
}

/**
 * Disconnects a store: revokes the API key (clears all key material so it can
 * never be reused) and resets site metadata. The store must generate a new key
 * to reconnect.
 */
export async function disconnect(
  connectionId: string,
): Promise<StoreConnectionRow> {
  const [updated] = await db
    .update(storeConnections)
    .set({
      status: "disconnected",
      apiKeyId: null,
      apiKeyHash: null,
      apiKeyPrefix: null,
      apiKeyGeneratedAt: null,
      // Wipe outbound key material so no usable secret survives a disconnect.
      apiKeyCipher: null,
      apiKeyIv: null,
      apiKeyTag: null,
      siteUrl: null,
      wpVersion: null,
      wcVersion: null,
      connectorVersion: null,
      lastHealthStatus: null,
      updatedAt: new Date(),
    })
    .where(eq(storeConnections.id, connectionId))
    .returning();

  if (!updated) {
    throw new Error("Failed to disconnect store");
  }
  return updated;
}
