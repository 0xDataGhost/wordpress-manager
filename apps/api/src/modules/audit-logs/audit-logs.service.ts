import { and, count, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "../../db";
import {
  auditLogs,
  type AuditAction,
  type AuditEntityType,
  type AuditLogRow,
} from "../../db/schema/audit-logs";
import { users } from "../../db/schema/users";
import { logger } from "../../lib/logger";
import type { AuditLogUserSummary } from "./audit-logs.serializer";
import type { ListAuditLogsQuery } from "./audit-logs.schemas";

/** Defensive caps so a single row can never be unexpectedly large. */
const MESSAGE_MAX = 2000;
const USER_AGENT_MAX = 512;

export interface RecordAuditLogInput {
  storeId: string;
  /** The acting dashboard user, or null for system / connector-driven actions. */
  userId?: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  message: string;
  /**
   * Non-sensitive structured context only. Callers MUST NOT pass passwords,
   * tokens, API keys, raw webhook payloads, or raw AI prompts.
   */
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Writes a store-scoped audit log entry. BEST-EFFORT BY DESIGN: it catches and
 * logs its own errors and never throws, so a logging failure can never break the
 * action it is recording. Every caller MUST pass the tenant's storeId.
 *
 * Only important write / security / system actions are recorded here — never
 * plain read requests — and `metadata` must hold only non-sensitive context.
 */
export async function recordAuditLog(
  input: RecordAuditLogInput,
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      storeId: input.storeId,
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      message: input.message.slice(0, MESSAGE_MAX),
      metadata: input.metadata ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent
        ? input.userAgent.slice(0, USER_AGENT_MAX)
        : null,
    });
  } catch (err) {
    // Never rethrow — the main action already succeeded and audit is best-effort.
    logger.error(
      { err, action: input.action, storeId: input.storeId },
      "Failed to write audit log",
    );
  }
}

export interface AuditLogWithUser {
  log: AuditLogRow;
  user: AuditLogUserSummary | null;
}

export interface ListAuditLogsResult {
  items: AuditLogWithUser[];
  total: number;
  page: number;
  limit: number;
}

/** Start of `date`'s day in UTC (matches how z.coerce.date parses YYYY-MM-DD). */
function startOfDayUtc(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

/** Start of the day AFTER `date` (UTC) — exclusive upper bound for an inclusive dateTo. */
function startOfNextDayUtc(date: Date): Date {
  const copy = startOfDayUtc(date);
  copy.setUTCDate(copy.getUTCDate() + 1);
  return copy;
}

/**
 * Lists a store's audit logs with optional filters (action, entity type, user,
 * date range) and pagination. Joins the acting user so the list can show who did
 * what. Ordered newest-first with a stable id tiebreaker so rows never shuffle
 * across pages (deterministic sort). Tenant-scoped — only the given store's rows
 * are ever returned.
 */
export async function listAuditLogs(
  storeId: string,
  query: ListAuditLogsQuery,
): Promise<ListAuditLogsResult> {
  const conditions = [eq(auditLogs.storeId, storeId)];
  if (query.action) {
    conditions.push(eq(auditLogs.action, query.action));
  }
  if (query.entityType) {
    conditions.push(eq(auditLogs.entityType, query.entityType));
  }
  if (query.userId) {
    conditions.push(eq(auditLogs.userId, query.userId));
  }
  if (query.dateFrom) {
    conditions.push(gte(auditLogs.createdAt, startOfDayUtc(query.dateFrom)));
  }
  if (query.dateTo) {
    conditions.push(lt(auditLogs.createdAt, startOfNextDayUtc(query.dateTo)));
  }

  const whereClause = and(...conditions);
  const offset = (query.page - 1) * query.limit;

  const [rows, totals] = await Promise.all([
    db
      .select({
        log: auditLogs,
        userId: users.id,
        userFullName: users.fullName,
        userEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(query.limit)
      .offset(offset),
    db.select({ value: count() }).from(auditLogs).where(whereClause),
  ]);

  const items: AuditLogWithUser[] = rows.map((row) => ({
    log: row.log,
    user:
      row.userId && row.userFullName && row.userEmail
        ? {
            id: row.userId,
            fullName: row.userFullName,
            email: row.userEmail,
          }
        : null,
  }));

  return {
    items,
    total: Number(totals[0]?.value ?? 0),
    page: query.page,
    limit: query.limit,
  };
}
