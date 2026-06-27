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
  { key: "customers.edit", description: "Edit customer internal notes" },
  { key: "team.view", description: "View team members" },
  { key: "team.create", description: "Invite team members" },
  { key: "team.edit", description: "Edit team members and roles" },
  { key: "team.delete", description: "Remove team members" },
  { key: "automations.view", description: "View automations" },
  { key: "automations.edit", description: "Configure automations" },
  { key: "settings.view", description: "View store settings" },
  { key: "settings.edit", description: "Edit store settings" },
  { key: "ai.view", description: "Use the AI assistants" },
  {
    key: "digital_inventory.view",
    description: "View digital product fulfillment settings",
  },
  {
    key: "digital_inventory.edit",
    description: "Edit digital product fulfillment settings",
  },
  {
    key: "digital_inventory.import",
    description: "Import digital codes into a product's inventory",
  },
  {
    key: "digital_inventory.reveal",
    description: "Reveal the full plaintext of a digital code",
  },
  {
    key: "digital_inventory.export",
    description: "Export digital code inventory",
  },
  {
    key: "digital_inventory.delete",
    description: "Permanently delete digital codes (prefer voiding instead)",
  },
  {
    key: "digital_delivery.view",
    description: "View digital code assignments and the delivery queue",
  },
  {
    key: "digital_delivery.assign",
    description: "Assign digital codes to orders",
  },
  {
    key: "digital_delivery.deliver",
    description: "Deliver assigned digital codes for an order",
  },
  {
    key: "digital_delivery.retry",
    description: "Retry a failed digital code delivery",
  },
  {
    key: "digital_delivery.resend",
    description: "Resend an already-assigned digital code to the customer",
  },
  {
    key: "digital_delivery.replace",
    description: "Replace a delivered/invalid digital code with a new one",
  },
  {
    key: "digital_delivery.refund",
    description: "Refund or cancel a digital code assignment (money-sensitive)",
  },
  {
    key: "digital_delivery.customer_link",
    description: "Generate and revoke customer self-service code links",
  },
  {
    key: "digital_suppliers.view",
    description: "View suppliers and their batches/metrics",
  },
  {
    key: "digital_suppliers.create",
    description: "Create suppliers",
  },
  {
    key: "digital_suppliers.edit",
    description: "Edit suppliers and their product mappings",
  },
  {
    key: "digital_suppliers.delete",
    description: "Archive suppliers",
  },
  {
    key: "digital_reports.view",
    description: "View digital product reports and profit analytics",
  },
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
      "customers.edit",
      "team.view",
      "automations.view",
      "automations.edit",
      "settings.view",
      "ai.view",
      "digital_inventory.view",
      "digital_inventory.edit",
      "digital_inventory.import",
      "digital_inventory.reveal",
      "digital_inventory.export",
      "digital_delivery.view",
      "digital_delivery.assign",
      "digital_delivery.deliver",
      "digital_delivery.retry",
      "digital_delivery.resend",
      "digital_delivery.replace",
      "digital_delivery.refund",
      "digital_delivery.customer_link",
      "digital_suppliers.view",
      "digital_suppliers.create",
      "digital_suppliers.edit",
      "digital_suppliers.delete",
      "digital_reports.view",
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
      "ai.view",
      "digital_inventory.view",
      "digital_inventory.edit",
      "digital_inventory.import",
      "digital_suppliers.view",
      "digital_suppliers.create",
      "digital_suppliers.edit",
      "digital_reports.view",
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
      "digital_inventory.view",
      "digital_delivery.view",
      "digital_delivery.assign",
      "digital_delivery.deliver",
      "digital_delivery.retry",
      "digital_delivery.resend",
      "digital_delivery.replace",
      "digital_delivery.customer_link",
    ],
  },
  {
    slug: "customer-support",
    name: "Customer Support",
    description: "Views customers and orders to assist buyers",
    permissions: [
      "dashboard.view",
      "customers.view",
      "customers.edit",
      "orders.view",
      "digital_inventory.view",
      "digital_delivery.view",
      "digital_delivery.retry",
      "digital_delivery.resend",
      "digital_delivery.replace",
      "digital_delivery.customer_link",
    ],
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
      "ai.view",
      "digital_reports.view",
    ],
  },
  {
    slug: "accountant",
    name: "Accountant",
    description: "Views financial data via orders and customers",
    permissions: [
      "dashboard.view",
      "orders.view",
      "customers.view",
      "ai.view",
      "digital_reports.view",
    ],
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
      "digital_inventory.view",
      "digital_delivery.view",
    ],
  },
];
