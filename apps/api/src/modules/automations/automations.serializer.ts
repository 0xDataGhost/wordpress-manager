import type { AutomationRow } from "../../db/schema/automations";
import type { AutomationLogRow } from "../../db/schema/automation-logs";
import { isAutomationType, normalizeConfig } from "./automations.config";

/**
 * Public API shape of an automation. `config` is normalized (defaults merged in
 * and validated) so the dashboard always receives a complete, valid config for
 * the row's type.
 */
export interface AutomationDto {
  id: string;
  storeId: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export function toAutomationDto(row: AutomationRow): AutomationDto {
  const config = isAutomationType(row.type)
    ? normalizeConfig(row.type, row.config)
    : (row.config ?? {});

  return {
    id: row.id,
    storeId: row.storeId,
    type: row.type,
    enabled: row.enabled,
    config,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Public API shape of an automation log entry. */
export interface AutomationLogDto {
  id: string;
  storeId: string;
  automationId: string;
  type: string;
  status: string;
  message: string | null;
  metadata: unknown;
  createdAt: Date;
}

export function toAutomationLogDto(row: AutomationLogRow): AutomationLogDto {
  return {
    id: row.id,
    storeId: row.storeId,
    automationId: row.automationId,
    type: row.type,
    status: row.status,
    message: row.message ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
  };
}
