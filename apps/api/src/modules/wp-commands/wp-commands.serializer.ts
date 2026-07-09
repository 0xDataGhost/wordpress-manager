import type { WpCommandRow } from "../../db/schema/wp-commands";

/**
 * Command Center DTO. Exposes the command's identity, target, lifecycle and
 * sanitized error — NOT the raw payload/result bodies (they may carry customer
 * data such as billing details; the Command Center needs status, not payloads).
 */
export interface WpCommandDto {
  id: string;
  domain: string;
  action: string;
  targetWpId: number | null;
  status: string;
  attempts: number;
  lastError: string | null;
  expectedVersion: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export function toWpCommandDto(row: WpCommandRow): WpCommandDto {
  return {
    id: row.id,
    domain: row.domain,
    action: row.action,
    targetWpId: row.targetWpId,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    expectedVersion: row.expectedVersion,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  };
}
