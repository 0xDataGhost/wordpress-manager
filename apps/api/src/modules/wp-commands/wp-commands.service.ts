import { randomUUID } from "node:crypto";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  wpCommands,
  type WpCommandDomain,
  type WpCommandRow,
  type WpCommandStatus,
} from "../../db/schema/wp-commands";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from "../../lib/errors";
import { logger } from "../../lib/logger";
import { recordAuditLog } from "../audit-logs/audit-logs.service";
import { createNotification } from "../notifications/notifications.service";
import { getConnectionByStoreId } from "../connections/connections.service";
import type { StoreConnectionRow } from "../../db/schema/store-connections";
import { wpRequest } from "../connections/wp-client";
import { resolveCommandRoute } from "./wp-commands.routes-map";

/**
 * The command outbox (Phase 25, plan3 §2.1): the SINGLE write path for every
 * SaaS -> WordPress mutation. A command is recorded BEFORE it is attempted,
 * carries a per-store idempotency key on every attempt (the connector replays
 * the stored result instead of re-applying), and travels with its command id
 * so the webhooks the mutation fires can be recognized as echoes.
 *
 * Execution is inline (synchronous) exactly like the existing publish/sync
 * paths — see queues.ts for the background-worker seam that replaces this when
 * a worker app lands. Failed commands stay retryable from the Command Center.
 */

/** Echo-suppression / idempotency headers sent with every command attempt. */
export const COMMAND_ID_HEADER = "X-Saas-Command-Id";
export const IDEMPOTENCY_KEY_HEADER = "X-Saas-Idempotency-Key";
export const EXPECTED_VERSION_HEADER = "X-Saas-Expected-Version";

/** A command that failed this many attempts is marked dead (manual attention). */
const MAX_COMMAND_ATTEMPTS = 5;

export interface RunWpCommandInput {
  storeId: string;
  domain: WpCommandDomain;
  /** Verb within the domain, e.g. "create", "update", "add_digital_note". */
  action: string;
  /** WooCommerce id of the target entity; null for creates. */
  targetWpId?: number | null;
  /** Normalized request body sent to the connector. Never secrets. */
  payload?: unknown;
  /** Compare-and-set token (entity date_modified the SaaS last saw). */
  expectedVersion?: string | null;
  /**
   * Idempotency key, unique per store. Callers that can retry the SAME logical
   * operation (e.g. refunds) MUST pass a stable key; defaults to a fresh UUID.
   */
  idempotencyKey?: string;
  /** Acting dashboard user; null/undefined for automation/system commands. */
  createdBy?: string | null;
}

export interface ListWpCommandsFilter {
  status?: WpCommandStatus;
  domain?: WpCommandDomain;
  page: number;
  limit: number;
}

export interface ListWpCommandsResult {
  items: WpCommandRow[];
  total: number;
  page: number;
  limit: number;
}

export interface WpCommandStats {
  total: number;
  byStatus: Record<WpCommandStatus, number>;
}

/** Loads the store's connection or throws the caller-facing 503 used today. */
async function requireWritableConnection(
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

/**
 * Records the command (or returns the existing row when the idempotency key
 * was already used — the outbox itself is idempotent at enqueue time).
 */
async function insertCommand(
  input: RunWpCommandInput,
  idempotencyKey: string,
): Promise<WpCommandRow> {
  const [inserted] = await db
    .insert(wpCommands)
    .values({
      storeId: input.storeId,
      idempotencyKey,
      domain: input.domain,
      action: input.action,
      targetWpId: input.targetWpId ?? null,
      payload: input.payload ?? null,
      expectedVersion: input.expectedVersion ?? null,
      status: "pending",
      createdBy: input.createdBy ?? null,
    })
    .onConflictDoNothing({
      target: [wpCommands.storeId, wpCommands.idempotencyKey],
    })
    .returning();
  if (inserted) return inserted;

  const [existing] = await db
    .select()
    .from(wpCommands)
    .where(
      and(
        eq(wpCommands.storeId, input.storeId),
        eq(wpCommands.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (!existing) {
    throw new Error("Failed to record WordPress command");
  }
  return existing;
}

/** Best-effort audit of a terminal command transition; never throws. */
async function auditCommandOutcome(
  row: WpCommandRow,
  message: string,
): Promise<void> {
  const action =
    row.status === "succeeded"
      ? AUDIT_ACTIONS.WP_COMMAND_EXECUTED
      : row.status === "conflict"
        ? AUDIT_ACTIONS.WP_COMMAND_CONFLICT
        : AUDIT_ACTIONS.WP_COMMAND_FAILED;
  await recordAuditLog({
    storeId: row.storeId,
    userId: row.createdBy ?? null,
    action,
    entityType: AUDIT_ENTITY_TYPES.WP_COMMAND,
    entityId: row.id,
    message,
    metadata: {
      domain: row.domain,
      action: row.action,
      targetWpId: row.targetWpId,
      status: row.status,
      attempts: row.attempts,
    },
  });
}

/** Best-effort failure notification; never throws, never breaks the command. */
async function notifyCommandFailure(row: WpCommandRow): Promise<void> {
  try {
    await createNotification({
      storeId: row.storeId,
      type: "wp_command_failed",
      title: "فشل أمر ووردبريس",
      message: `تعذّر تنفيذ الأمر (${row.domain}.${row.action}) على متجر ووردبريس. يمكن إعادة المحاولة من مركز الأوامر.`,
      severity: row.status === "dead" ? "error" : "warning",
      metadata: {
        commandId: row.id,
        domain: row.domain,
        action: row.action,
        targetWpId: row.targetWpId,
        attempts: row.attempts,
      },
    });
  } catch (err) {
    logger.error({ err, commandId: row.id }, "Failed to notify command failure");
  }
}

/**
 * Executes one attempt of a command against the connector and records the
 * outcome. Returns the updated row; does not throw on connector failure (the
 * failure is IN the row) — only on programming errors.
 */
async function executeCommand(
  connection: StoreConnectionRow,
  row: WpCommandRow,
): Promise<WpCommandRow> {
  const route = resolveCommandRoute(row.domain as WpCommandDomain, row.action, {
    targetWpId: row.targetWpId,
    payload: row.payload,
  });

  const attempts = row.attempts + 1;
  await db
    .update(wpCommands)
    .set({ status: "sending", attempts, updatedAt: new Date() })
    .where(eq(wpCommands.id, row.id));

  const headers: Record<string, string> = {
    [COMMAND_ID_HEADER]: row.id,
    [IDEMPOTENCY_KEY_HEADER]: row.idempotencyKey,
  };
  if (row.expectedVersion) {
    headers[EXPECTED_VERSION_HEADER] = row.expectedVersion;
  }

  let result;
  try {
    result = await wpRequest(
      connection,
      route.method,
      route.path,
      row.payload ?? undefined,
      { headers },
    );
  } catch (err) {
    // resolveSecret / SSRF guard throw typed 503s. Record, then rethrow so the
    // caller surfaces the precise configuration problem.
    const message =
      err instanceof Error ? err.message : "Outbound delivery unavailable.";
    const failedRow = await finalizeCommand(row.id, {
      status: "failed",
      lastError: message,
    });
    await auditCommandOutcome(failedRow, `فشل أمر ووردبريس: ${row.domain}.${row.action}`);
    await notifyCommandFailure(failedRow);
    throw err;
  }

  if (result.ok) {
    const succeededRow = await finalizeCommand(row.id, {
      status: "succeeded",
      result: result.data ?? null,
      lastError: null,
    });
    await auditCommandOutcome(
      succeededRow,
      `نفّذ أمر ووردبريس: ${row.domain}.${row.action}`,
    );
    return succeededRow;
  }

  if (result.code === 409) {
    const conflictRow = await finalizeCommand(row.id, {
      status: "conflict",
      lastError: result.message.slice(0, 1000),
    });
    await auditCommandOutcome(
      conflictRow,
      `تعارض أمر ووردبريس (تم تعديل الكيان في ووردبريس): ${row.domain}.${row.action}`,
    );
    return conflictRow;
  }

  const status: WpCommandStatus =
    attempts >= MAX_COMMAND_ATTEMPTS ? "dead" : "failed";
  const failedRow = await finalizeCommand(row.id, {
    status,
    lastError: result.message.slice(0, 1000),
  });
  await auditCommandOutcome(
    failedRow,
    `فشل أمر ووردبريس: ${row.domain}.${row.action}`,
  );
  await notifyCommandFailure(failedRow);
  return failedRow;
}

interface FinalizeFields {
  status: WpCommandStatus;
  result?: unknown;
  lastError?: string | null;
}

async function finalizeCommand(
  commandId: string,
  fields: FinalizeFields,
): Promise<WpCommandRow> {
  const now = new Date();
  const terminal =
    fields.status === "succeeded" ||
    fields.status === "conflict" ||
    fields.status === "dead";
  const [updated] = await db
    .update(wpCommands)
    .set({
      status: fields.status,
      result: fields.result === undefined ? undefined : fields.result,
      lastError: fields.lastError === undefined ? undefined : fields.lastError,
      updatedAt: now,
      completedAt: terminal || fields.status === "failed" ? now : null,
    })
    .where(eq(wpCommands.id, commandId))
    .returning();
  if (!updated) {
    throw new Error("Failed to finalize WordPress command");
  }
  return updated;
}

/**
 * The one entry point modules use to mutate WordPress. Records the command,
 * executes it inline and returns the terminal row (succeeded / conflict /
 * failed). A replayed idempotency key whose command already succeeded returns
 * the stored row without contacting WordPress again.
 */
export async function runWpCommand(
  input: RunWpCommandInput,
): Promise<WpCommandRow> {
  const connection = await requireWritableConnection(input.storeId);
  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const row = await insertCommand(input, idempotencyKey);

  // Enqueue-level idempotency: an already-terminal command is never re-run.
  if (row.status === "succeeded" || row.status === "conflict") return row;
  if (row.status === "sending") {
    // Another in-flight execution owns this command (concurrent duplicate).
    return row;
  }
  return executeCommand(connection, row);
}

/**
 * Convenience wrapper preserving the existing module error semantics: throws
 * ConflictError on compare-and-set conflicts and ServiceUnavailableError on
 * delivery failure, returning only succeeded rows.
 */
export async function runWpCommandOrThrow(
  input: RunWpCommandInput,
): Promise<WpCommandRow> {
  const row = await runWpCommand(input);
  if (row.status === "succeeded") return row;
  if (row.status === "conflict") {
    throw new ConflictError(
      "WordPress has a newer version of this entity. Refresh and try again.",
    );
  }
  throw new ServiceUnavailableError(
    `Failed to deliver the change to WooCommerce: ${row.lastError ?? "unknown error"}`,
  );
}

/**
 * Confirms a command from its webhook echo (the connector round-tripped our
 * command id). Tenant-scoped; returns the matched row or null when the id does
 * not belong to this store (the webhook is then processed normally).
 */
export async function confirmCommandEcho(
  storeId: string,
  originCommandId: string,
): Promise<WpCommandRow | null> {
  const [row] = await db
    .select()
    .from(wpCommands)
    .where(
      and(eq(wpCommands.storeId, storeId), eq(wpCommands.id, originCommandId)),
    )
    .limit(1);
  if (!row) return null;

  // The inline HTTP response usually finalizes first; the echo is confirmation.
  // If the response was lost (timeout after WP applied the change), the echo is
  // what flips the command to succeeded.
  if (row.status === "pending" || row.status === "sending" || row.status === "failed") {
    return finalizeCommand(row.id, { status: "succeeded", lastError: null });
  }
  return row;
}

/** Retries a failed/dead command from the Command Center (permission-gated). */
export async function retryWpCommand(
  storeId: string,
  commandId: string,
  userId: string,
): Promise<WpCommandRow> {
  const [row] = await db
    .select()
    .from(wpCommands)
    .where(and(eq(wpCommands.storeId, storeId), eq(wpCommands.id, commandId)))
    .limit(1);
  if (!row) {
    throw new NotFoundError("Command not found");
  }
  if (row.status !== "failed" && row.status !== "dead") {
    throw new ValidationError(
      "Only failed commands can be retried. Conflicted commands need a fresh edit after refreshing.",
    );
  }
  const connection = await requireWritableConnection(storeId);
  await recordAuditLog({
    storeId,
    userId,
    action: AUDIT_ACTIONS.WP_COMMAND_RETRIED,
    entityType: AUDIT_ENTITY_TYPES.WP_COMMAND,
    entityId: row.id,
    message: `أعاد محاولة أمر ووردبريس: ${row.domain}.${row.action}`,
    metadata: { domain: row.domain, action: row.action, attempts: row.attempts },
  });
  return executeCommand(connection, row);
}

/** Tenant-scoped, newest-first Command Center list with status/domain filters. */
export async function listWpCommands(
  storeId: string,
  filter: ListWpCommandsFilter,
): Promise<ListWpCommandsResult> {
  const conditions = [eq(wpCommands.storeId, storeId)];
  if (filter.status) conditions.push(eq(wpCommands.status, filter.status));
  if (filter.domain) conditions.push(eq(wpCommands.domain, filter.domain));
  const whereClause = and(...conditions);
  const offset = (filter.page - 1) * filter.limit;

  const [items, totals] = await Promise.all([
    db
      .select()
      .from(wpCommands)
      .where(whereClause)
      .orderBy(desc(wpCommands.createdAt), desc(wpCommands.id))
      .limit(filter.limit)
      .offset(offset),
    db.select({ value: count() }).from(wpCommands).where(whereClause),
  ]);

  return {
    items,
    total: Number(totals[0]?.value ?? 0),
    page: filter.page,
    limit: filter.limit,
  };
}

/** Loads one command within the tenant scope. */
export async function getWpCommandById(
  storeId: string,
  commandId: string,
): Promise<WpCommandRow | null> {
  const [row] = await db
    .select()
    .from(wpCommands)
    .where(and(eq(wpCommands.storeId, storeId), eq(wpCommands.id, commandId)))
    .limit(1);
  return row ?? null;
}

/** Status counts for the Command Center header cards. */
export async function getWpCommandStats(
  storeId: string,
): Promise<WpCommandStats> {
  const rows = await db
    .select({ status: wpCommands.status, value: count() })
    .from(wpCommands)
    .where(eq(wpCommands.storeId, storeId))
    .groupBy(wpCommands.status);

  const byStatus: Record<WpCommandStatus, number> = {
    pending: 0,
    sending: 0,
    succeeded: 0,
    conflict: 0,
    failed: 0,
    dead: 0,
  };
  let total = 0;
  for (const row of rows) {
    const key = row.status as WpCommandStatus;
    const value = Number(row.value);
    if (key in byStatus) byStatus[key] = value;
    total += value;
  }
  return { total, byStatus };
}
