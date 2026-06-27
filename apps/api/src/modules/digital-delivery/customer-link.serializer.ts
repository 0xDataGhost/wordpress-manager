import type { CustomerAccessTokenRow } from "../../db/schema/customer-access-tokens";
import { resolveLinkStatus, type LinkStatus } from "../customer-access/customer-access.policy";

/**
 * Public DTO for a customer access link (Phase 22). SECURITY: the `token_hash` is
 * NEVER exposed — there is no field that could reconstruct or reveal the token.
 * Only lifecycle metadata is returned for the staff UI.
 */
export interface CustomerLinkDto {
  id: string;
  expiresAt: Date;
  maxUses: number | null;
  usedCount: number;
  revokedAt: Date | null;
  createdAt: Date;
  status: LinkStatus;
}

export function toCustomerLinkDto(
  row: CustomerAccessTokenRow,
  now: number = Date.now(),
): CustomerLinkDto {
  return {
    id: row.id,
    expiresAt: row.expiresAt,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    status: resolveLinkStatus(row, now),
  };
}
