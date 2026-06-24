import type { Request } from "express";
import type {
  AuditAction,
  AuditEntityType,
} from "../../db/schema/audit-logs";
import { recordAuditLog } from "./audit-logs.service";

export interface RequestAuditParams {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  message: string;
  /** Non-sensitive structured context only (see recordAuditLog). */
  metadata?: Record<string, unknown> | null;
  /**
   * Tenant override for endpoints where `req.auth` is absent — login (store from
   * the auth result) and connector-authenticated routes (store from the API key).
   */
  storeId?: string;
  /** Acting user override (e.g. login result, or `null` for system actions). */
  userId?: string | null;
}

/** Best client IP. `trust proxy` is enabled, so `req.ip` honors X-Forwarded-For. */
function clientIp(req: Request): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

/**
 * Records an audit log from an Express request, deriving the IP, user agent,
 * tenant and acting user from the request (with optional overrides). Best-effort
 * — delegates to `recordAuditLog`, which never throws — so awaiting it can never
 * break the handler. Skips silently when no tenant can be resolved.
 */
export async function recordAuditFromRequest(
  req: Request,
  params: RequestAuditParams,
): Promise<void> {
  const storeId = params.storeId ?? req.auth?.storeId;
  if (!storeId) {
    return;
  }
  const userId =
    params.userId !== undefined ? params.userId : (req.auth?.userId ?? null);

  await recordAuditLog({
    storeId,
    userId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    message: params.message,
    metadata: params.metadata ?? null,
    ipAddress: clientIp(req),
    userAgent: req.get("user-agent") ?? null,
  });
}
