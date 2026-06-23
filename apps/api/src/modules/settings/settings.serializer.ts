import type { StoreSettingsRow } from "../../db/schema/settings";
import { normalizeSettings, type SettingsData } from "./settings.schemas";

/**
 * Public API shape of a store's settings. The stored jsonb is normalized
 * (defaults merged in + validated) so the client always receives a complete,
 * valid settings object grouped by category.
 */
export interface SettingsDto extends SettingsData {
  storeId: string;
  updatedAt: Date;
}

export function toSettingsDto(row: StoreSettingsRow): SettingsDto {
  const data = normalizeSettings(row.data);
  return {
    storeId: row.storeId,
    ...data,
    updatedAt: row.updatedAt,
  };
}
