/**
 * Drizzle schema barrel — the single source of truth for the database schema
 * and the input for drizzle-kit migration generation.
 *
 * Business tables (users, stores, store_users, roles, permissions,
 * role_permissions, user_roles, refresh_tokens, ...) are added in Phase 3.
 * Multi-tenant tables must carry a `store_id` (tenant) column and scope every
 * query by it. Keep all table definitions exported from this module.
 */

export {};
