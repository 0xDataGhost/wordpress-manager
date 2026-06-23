/**
 * Drizzle schema barrel — the single source of truth for the database schema
 * and the input for drizzle-kit migration generation.
 *
 * Multi-tenant tables carry a `store_id` (tenant) column and every query must
 * scope by it. Keep all table definitions exported from this module.
 */

export * from "./users";
export * from "./stores";
export * from "./store-users";
export * from "./roles";
export * from "./permissions";
export * from "./role-permissions";
export * from "./user-roles";
export * from "./refresh-tokens";
export * from "./store-connections";
export * from "./products";
export * from "./product-images";
export * from "./customers";
export * from "./orders";
export * from "./order-items";
export * from "./external-mappings";
export * from "./sync-jobs";
export * from "./webhook-events";
export * from "./notifications";
export * from "./automations";
export * from "./automation-logs";
