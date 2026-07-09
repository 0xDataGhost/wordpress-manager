import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  storeConfigSnapshots,
  type StoreConfigSnapshotRow,
} from "../../db/schema/store-config";
import { getConnectionByStoreId } from "../connections/connections.service";
import { wpRequest } from "../connections/wp-client";
import { runWpCommandOrThrow } from "../wp-commands/wp-commands.service";
import { createNotification } from "../notifications/notifications.service";
import { logger } from "../../lib/logger";
import { ServiceUnavailableError, ValidationError } from "../../lib/errors";
import type { StoreConnectionRow } from "../../db/schema/store-connections";
import {
  SETTINGS_FIELD_ALLOWLIST,
  type SettingsGroup,
  type UpdateSettingsInput,
} from "./store-config.schemas";

/**
 * Store configuration (Phase 30). The strictest module in plan3:
 *  - reads go live to the connector, which strips secret-typed fields;
 *  - writes are field-allowlisted HERE (before the outbox) and again at the
 *    connector — unknown fields are rejected, never forwarded;
 *  - gateway secrets are never read, stored or transmitted (plan3 §2.3);
 *  - every write raises a store notification (money-flow visibility).
 */

async function requireConnection(
  storeId: string,
): Promise<StoreConnectionRow> {
  const connection = await getConnectionByStoreId(storeId);
  if (!connection || connection.status !== "connected" || !connection.siteUrl) {
    throw new ServiceUnavailableError(
      "Store is not connected to WordPress. Connect the store first.",
    );
  }
  return connection;
}

/** Persists a fetched, secret-stripped snapshot for a config group. */
async function saveSnapshot(
  storeId: string,
  group: string,
  data: unknown,
): Promise<StoreConfigSnapshotRow> {
  const now = new Date();
  const [existing] = await db
    .select({ id: storeConfigSnapshots.id })
    .from(storeConfigSnapshots)
    .where(
      and(
        eq(storeConfigSnapshots.storeId, storeId),
        eq(storeConfigSnapshots.group, group),
      ),
    )
    .limit(1);
  if (existing) {
    const [updated] = await db
      .update(storeConfigSnapshots)
      .set({ data, fetchedAt: now, updatedAt: now })
      .where(eq(storeConfigSnapshots.id, existing.id))
      .returning();
    return updated!;
  }
  const [inserted] = await db
    .insert(storeConfigSnapshots)
    .values({ storeId, group, data, fetchedAt: now })
    .returning();
  if (!inserted) throw new Error("Failed to save config snapshot");
  return inserted;
}

/** Live-reads a connector path and returns the parsed data (throws on failure). */
async function connectorGet(
  connection: StoreConnectionRow,
  path: string,
): Promise<unknown> {
  const result = await wpRequest(connection, "GET", path);
  if (!result.ok) {
    throw new ServiceUnavailableError(
      `Failed to read ${path} from WooCommerce: ${result.message}`,
    );
  }
  return result.data;
}

export interface ConfigReadResult {
  data: unknown;
  fetchedAt: Date;
}

/** GET a settings group live, and refresh the snapshot. */
export async function getSettingsGroup(
  storeId: string,
  group: SettingsGroup,
): Promise<ConfigReadResult> {
  const connection = await requireConnection(storeId);
  const data = await connectorGet(connection, `settings/${group}`);
  const snapshot = await saveSnapshot(storeId, group, data);
  return { data: snapshot.data, fetchedAt: snapshot.fetchedAt };
}

/** GET shipping zones (+ methods) live. */
export async function getShipping(
  storeId: string,
): Promise<ConfigReadResult> {
  const connection = await requireConnection(storeId);
  const data = await connectorGet(connection, "shipping/zones");
  const snapshot = await saveSnapshot(storeId, "shipping_zones", data);
  return { data: snapshot.data, fetchedAt: snapshot.fetchedAt };
}

/** GET tax rates live. */
export async function getTaxRates(
  storeId: string,
): Promise<ConfigReadResult> {
  const connection = await requireConnection(storeId);
  const data = await connectorGet(connection, "taxes/rates");
  const snapshot = await saveSnapshot(storeId, "tax_rates", data);
  return { data: snapshot.data, fetchedAt: snapshot.fetchedAt };
}

/**
 * GET payment gateways live. The connector strips secret fields; we assert
 * defensively that nothing secret-looking survives before returning/snapshotting
 * (belt-and-braces for plan3 §2.3).
 */
export async function getGateways(
  storeId: string,
): Promise<ConfigReadResult> {
  const connection = await requireConnection(storeId);
  const data = await connectorGet(connection, "gateways");
  const safe = stripSecretsDefensively(data);
  const snapshot = await saveSnapshot(storeId, "gateways", safe);
  return { data: snapshot.data, fetchedAt: snapshot.fetchedAt };
}

/** Best-effort store notification for a config change; never throws. */
async function notifyConfigChange(
  storeId: string,
  title: string,
  message: string,
): Promise<void> {
  try {
    await createNotification({
      storeId,
      type: "store_settings_changed",
      title,
      message,
      severity: "warning",
    });
  } catch (err) {
    logger.error({ err, storeId }, "Failed to notify config change");
  }
}

/**
 * Update an allowlisted settings group. Any field not in the group's allowlist
 * is rejected (never forwarded). Refreshes the snapshot and notifies.
 */
export async function updateSettingsGroup(
  storeId: string,
  group: SettingsGroup,
  input: UpdateSettingsInput,
  userId: string,
): Promise<ConfigReadResult> {
  const allow = new Set(SETTINGS_FIELD_ALLOWLIST[group]);
  const unknown = Object.keys(input.values).filter((k) => !allow.has(k));
  if (unknown.length > 0) {
    throw new ValidationError(
      `These settings are not editable from the dashboard: ${unknown.join(", ")}`,
    );
  }
  if (Object.keys(input.values).length === 0) {
    throw new ValidationError("No settings to update.");
  }

  await runWpCommandOrThrow({
    storeId,
    domain: "settings",
    action: "update",
    payload: { group, values: input.values },
    createdBy: userId,
  });

  await notifyConfigChange(
    storeId,
    "تغيير إعدادات المتجر",
    `تم تعديل إعدادات (${group}) في ووردبريس من لوحة التحكم.`,
  );

  return getSettingsGroup(storeId, group);
}

/** Runs a shipping/tax/gateway command and refreshes the relevant snapshot. */
export async function runConfigCommand(
  storeId: string,
  domain: "shipping" | "tax" | "settings",
  action: string,
  payload: Record<string, unknown>,
  userId: string,
  refresh: "shipping" | "taxes" | "gateways" | null,
): Promise<ConfigReadResult | { ok: true }> {
  await runWpCommandOrThrow({
    storeId,
    domain,
    action,
    // Numeric target when the payload carries a WooCommerce id we route on.
    targetWpId:
      typeof payload.zoneId === "number"
        ? (payload.zoneId as number)
        : typeof payload.rateId === "number"
          ? (payload.rateId as number)
          : null,
    payload,
    createdBy: userId,
  });

  await notifyConfigChange(
    storeId,
    "تغيير إعدادات المتجر",
    "تم تعديل إعدادات الشحن/الضرائب/بوابات الدفع في ووردبريس من لوحة التحكم.",
  );

  if (refresh === "shipping") return getShipping(storeId);
  if (refresh === "taxes") return getTaxRates(storeId);
  if (refresh === "gateways") return getGateways(storeId);
  return { ok: true };
}

/**
 * Defensive secret strip: drops any object key that looks like a credential.
 * The connector is the primary defense (its gateway response is built from an
 * explicit safe-field allowlist and never reads gateway settings); this is a
 * second wall so a future connector regression can never surface a secret
 * through the SaaS. Deliberately broad — for a "never leak a secret" wall,
 * over-stripping a gateway field is the safe failure mode (the only gateway
 * fields the dashboard needs are id/title/description/enabled/method/refunds,
 * none of which match). Covers the credential half of username-based gateways
 * (Authorize.net login, API usernames) and connected-account ids, which the
 * previous regex missed (Phase 32 audit H1).
 */
const SECRET_KEY_RE =
  /(secret|password|passwd|key|apikey|token|credential|signing|signature|merchant|publishable|client_?id|\blogin\b|user_?name|user_?id|account_?id|bearer|auth)/i;

export function stripSecretsDefensively(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => stripSecretsDefensively(v));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_RE.test(key)) continue;
      out[key] = stripSecretsDefensively(val);
    }
    return out;
  }
  return value;
}
