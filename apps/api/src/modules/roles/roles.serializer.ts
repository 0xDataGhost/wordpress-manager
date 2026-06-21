import type { RoleWithPermissions } from "./roles.service";

export interface RoleDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  storeId: string | null;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

export function toRoleDto(role: RoleWithPermissions): RoleDto {
  return {
    id: role.id,
    name: role.name,
    slug: role.slug,
    description: role.description,
    isSystem: role.isSystem,
    storeId: role.storeId,
    permissions: role.permissions,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}
