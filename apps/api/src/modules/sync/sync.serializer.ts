import type { SyncJobRow } from "../../db/schema/sync-jobs";

/** Public API shape of a sync job. Carries only non-sensitive run metadata. */
export interface SyncJobDto {
  id: string;
  entityType: string;
  source: string;
  trigger: string;
  status: string;
  total: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export function toSyncJobDto(row: SyncJobRow): SyncJobDto {
  return {
    id: row.id,
    entityType: row.entityType,
    source: row.source,
    trigger: row.trigger,
    status: row.status,
    total: row.total,
    createdCount: row.createdCount,
    updatedCount: row.updatedCount,
    failedCount: row.failedCount,
    error: row.error,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
  };
}
