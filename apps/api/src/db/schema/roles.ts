import { sql } from "drizzle-orm";
import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";

/**
 * Roles are sets of permissions. System roles (store_id = NULL, is_system =
 * true) are seeded templates shared by every tenant; store-scoped roles
 * (store_id set) are custom roles owned by a single tenant.
 */
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id").references(() => stores.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // System role slugs are globally unique (store_id IS NULL).
    systemSlugUnique: uniqueIndex("roles_system_slug_unique")
      .on(table.slug)
      .where(sql`${table.storeId} is null`),
    // Custom role slugs are unique within their store.
    storeSlugUnique: uniqueIndex("roles_store_slug_unique")
      .on(table.storeId, table.slug)
      .where(sql`${table.storeId} is not null`),
  }),
);

export type RoleRow = typeof roles.$inferSelect;
export type NewRoleRow = typeof roles.$inferInsert;
