/**
 * Roles API client (Team & Permissions UI — Phase 21.5.1).
 *
 * Calls the backend roles module (mounted at /api/v1/roles) through the shared
 * HTTP client, which attaches the Bearer token and unwraps the response envelope:
 *   listRoles → GET /roles  (JWT, team.view)
 *
 * The backend currently exposes only this read endpoint: it returns the seeded
 * system roles plus the store's custom roles, each with its full permission-key
 * list. There are NO role create/edit/delete or team-member endpoints yet, so the
 * UI built on this client is intentionally read-only.
 */

import { apiRequest } from "./http";

export interface RoleDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** True for seeded system roles (store_id NULL) — not editable. */
  isSystem: boolean;
  /** NULL for system roles; the owning store id for custom roles. */
  storeId: string | null;
  /** Granular permission keys granted to this role (e.g. "orders.edit"). */
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

/** Lists the roles visible to the current store (system + custom), with permissions. */
export async function listRoles(): Promise<RoleDto[]> {
  return apiRequest<RoleDto[]>("/roles", { method: "GET" });
}
