/**
 * Single source of truth for the RBAC catalog: every granular permission key
 * and every seeded system role with the permissions it grants. The seed script
 * (src/db/seed.ts) materialises this into the database.
 *
 * Authorization is permission-based: code checks permission keys
 * (e.g. "products.edit"), not role names. Roles are just named bundles of keys.
 */

export const PERMISSIONS = [
  { key: "dashboard.view", description: "View the dashboard" },
  { key: "products.view", description: "View products" },
  { key: "products.create", description: "Create products" },
  { key: "products.edit", description: "Edit products" },
  { key: "products.delete", description: "Delete products" },
  { key: "orders.view", description: "View orders" },
  { key: "orders.edit", description: "Edit orders" },
  { key: "customers.view", description: "View customers" },
  { key: "team.view", description: "View team members" },
  { key: "team.create", description: "Invite team members" },
  { key: "team.edit", description: "Edit team members and roles" },
  { key: "team.delete", description: "Remove team members" },
  { key: "automations.view", description: "View automations" },
  { key: "automations.edit", description: "Configure automations" },
  { key: "settings.view", description: "View store settings" },
  { key: "settings.edit", description: "Edit store settings" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map((p) => p.key);

const ALL: PermissionKey[] = [...PERMISSION_KEYS];

export interface SystemRoleDefinition {
  slug: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
}

/** The slug auto-assigned to a store's creator. */
export const OWNER_ROLE_SLUG = "owner";

/**
 * Seeded system roles (store_id = NULL). The permission sets satisfy the
 * Phase 14 QA expectations (Owner = all, Viewer = read-only, etc.).
 */
export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    slug: OWNER_ROLE_SLUG,
    name: "Owner",
    description: "Full access to the store and all settings",
    permissions: ALL,
  },
  {
    slug: "manager",
    name: "Manager",
    description:
      "Manages day-to-day operations across products, orders and team",
    permissions: [
      "dashboard.view",
      "products.view",
      "products.create",
      "products.edit",
      "products.delete",
      "orders.view",
      "orders.edit",
      "customers.view",
      "team.view",
      "automations.view",
      "automations.edit",
      "settings.view",
    ],
  },
  {
    slug: "product-manager",
    name: "Product Manager",
    description: "Manages the product catalog",
    permissions: [
      "dashboard.view",
      "products.view",
      "products.create",
      "products.edit",
      "products.delete",
      "customers.view",
    ],
  },
  {
    slug: "order-employee",
    name: "Order Employee",
    description: "Views and processes orders",
    permissions: [
      "dashboard.view",
      "orders.view",
      "orders.edit",
      "customers.view",
    ],
  },
  {
    slug: "customer-support",
    name: "Customer Support",
    description: "Views customers and orders to assist buyers",
    permissions: ["dashboard.view", "customers.view", "orders.view"],
  },
  {
    slug: "marketer",
    name: "Marketer",
    description: "Views catalog and customers; no access to sensitive settings",
    permissions: [
      "dashboard.view",
      "products.view",
      "customers.view",
      "automations.view",
    ],
  },
  {
    slug: "accountant",
    name: "Accountant",
    description: "Views financial data via orders and customers",
    permissions: ["dashboard.view", "orders.view", "customers.view"],
  },
  {
    slug: "viewer",
    name: "Viewer",
    description: "Read-only access; cannot create, edit or delete",
    permissions: [
      "dashboard.view",
      "products.view",
      "orders.view",
      "customers.view",
    ],
  },
];
