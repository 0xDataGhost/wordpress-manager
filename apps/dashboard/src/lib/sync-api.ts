/**
 * Manual WooCommerce sync client.
 *
 * Triggers a server-side pull of WooCommerce data into the SaaS and reads recent
 * sync job history. All calls are JWT-authenticated and tenant-scoped on the
 * backend:
 *   triggerSync     → POST /sync/{entity}  (settings.edit)
 *   fetchSyncStatus → GET  /sync/status    (settings.view)
 */

import { apiRequest } from "./http";

export type SyncEntity = "products" | "orders" | "customers" | "all";

export type SyncJobStatus = "queued" | "running" | "completed" | "failed";

export interface SyncJobDto {
  id: string;
  entityType: string;
  source: string;
  trigger: string;
  status: SyncJobStatus;
  total: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

/** Runs a manual sync for one entity (or everything) and returns the job. */
export async function triggerSync(entity: SyncEntity): Promise<SyncJobDto> {
  const result = await apiRequest<{ job: SyncJobDto }>(`/sync/${entity}`, {
    method: "POST",
  });
  return result.job;
}

/** Reads recent sync jobs for the current store, newest first. */
export async function fetchSyncStatus(): Promise<SyncJobDto[]> {
  const result = await apiRequest<{ jobs: SyncJobDto[] }>("/sync/status", {
    method: "GET",
  });
  return result.jobs;
}
