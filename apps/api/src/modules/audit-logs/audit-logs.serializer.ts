import type { AuditLogRow } from "../../db/schema/audit-logs";

/** Minimal acting-user summary attached to an audit log for display. */
export interface AuditLogUserSummary {
  id: string;
  fullName: string;
  email: string;
}

/**
 * Public API shape of an audit log. `user` is the acting dashboard user when one
 * is known (null for system / connector-driven actions). `metadata` passes the
 * stored jsonb through untouched — it only ever holds non-sensitive context.
 */
export interface AuditLogDto {
  id: string;
  storeId: string;
  userId: string | null;
  user: AuditLogUserSummary | null;
  action: string;
  entityType: string;
  entityId: string | null;
  message: string;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export function toAuditLogDto(
  row: AuditLogRow,
  user: AuditLogUserSummary | null = null,
): AuditLogDto {
  return {
    id: row.id,
    storeId: row.storeId,
    userId: row.userId ?? null,
    user,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId ?? null,
    message: row.message,
    metadata: row.metadata ?? null,
    ipAddress: row.ipAddress ?? null,
    userAgent: row.userAgent ?? null,
    createdAt: row.createdAt,
  };
}
