import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { customers, type CustomerRow } from "../../db/schema/customers";
import { orders, type OrderRow } from "../../db/schema/orders";
import { NotFoundError } from "../../lib/errors";
import { escapeLike } from "../../lib/sql";
import type { CustomerMetricsDto } from "./customers.serializer";
import type {
  ListCustomersQuery,
  UpdateCustomerNotesInput,
} from "./customers.schemas";

/** Cap on linked orders returned with the details page (most recent first). */
const RECENT_ORDERS_LIMIT = 20;

/**
 * Order statuses that count as realised revenue for `total_spent`, matching
 * WooCommerce's default paid statuses (`wc_get_is_paid_statuses()`). Money from
 * cancelled / refunded / failed / pending / on-hold orders is NOT counted as
 * spent. Order *count* and first/last order dates still span every status.
 */
const PAID_ORDER_STATUSES = ["completed", "processing"] as const;

/** Effective order date: WooCommerce placed-at when known, else our created-at. */
const orderDate = sql`coalesce(${orders.placedAt}, ${orders.createdAt})`;

/** Normalises a pg aggregate timestamp (Date | string | null) to Date | null. */
function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export interface ListCustomersResult {
  items: CustomerRow[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Lists a store's customers with optional search (name/email/phone) and
 * pagination. Ordered newest-first with a stable id tiebreaker so rows never
 * shuffle across page boundaries. List metrics use the WooCommerce-synced
 * aggregate columns on the customer row (fast, no per-row queries).
 */
export async function listCustomers(
  storeId: string,
  query: ListCustomersQuery,
): Promise<ListCustomersResult> {
  const conditions = [eq(customers.storeId, storeId)];

  if (query.search) {
    const term = `%${escapeLike(query.search)}%`;
    const match = or(
      ilike(customers.name, term),
      ilike(customers.email, term),
      ilike(customers.phone, term),
    );
    if (match) conditions.push(match);
  }

  const whereClause = and(...conditions);
  const offset = (query.page - 1) * query.limit;

  const [items, totals] = await Promise.all([
    db
      .select()
      .from(customers)
      .where(whereClause)
      .orderBy(desc(customers.createdAt), desc(customers.id))
      .limit(query.limit)
      .offset(offset),
    db.select({ value: count() }).from(customers).where(whereClause),
  ]);

  return {
    items,
    total: Number(totals[0]?.value ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

export interface CustomerDetails {
  customer: CustomerRow;
  metrics: CustomerMetricsDto;
  recentOrders: OrderRow[];
}

/**
 * Fetches one customer (scoped to the store) with metrics computed from its
 * locally synced orders and the most recent linked orders. Metrics are derived
 * from the same `orders` rows shown in `recentOrders` so the two always agree.
 * Returns null when the customer does not belong to the store.
 *
 * Metric status scope:
 *   - totalOrders   : ALL of the customer's orders (full order history).
 *   - totalSpent    : only PAID orders (completed, processing) — realised revenue.
 *   - firstOrderAt  : earliest order date across ALL statuses.
 *   - lastOrderAt   : latest order date across ALL statuses.
 */
export async function getCustomerDetails(
  storeId: string,
  id: string,
): Promise<CustomerDetails | null> {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.storeId, storeId), eq(customers.id, id)))
    .limit(1);

  if (!customer) return null;

  // One aggregate query over the customer's orders (no N+1). total_spent is
  // summed only over paid statuses; count and dates span all statuses.
  const [agg] = await db
    .select({
      totalOrders: count(orders.id),
      totalSpent: sql<string>`coalesce(sum(${orders.total}) filter (where ${inArray(
        orders.status,
        [...PAID_ORDER_STATUSES],
      )}), 0)`,
      firstOrderAt: sql<Date | null>`min(${orderDate})`,
      lastOrderAt: sql<Date | null>`max(${orderDate})`,
    })
    .from(orders)
    .where(and(eq(orders.storeId, storeId), eq(orders.customerId, id)));

  const metrics: CustomerMetricsDto = {
    totalOrders: Number(agg?.totalOrders ?? 0),
    totalSpent: Number(agg?.totalSpent ?? 0).toFixed(2),
    firstOrderAt: toDate(agg?.firstOrderAt),
    lastOrderAt: toDate(agg?.lastOrderAt),
  };

  const recentOrders = await db
    .select()
    .from(orders)
    .where(and(eq(orders.storeId, storeId), eq(orders.customerId, id)))
    .orderBy(sql`${orderDate} desc`, desc(orders.id))
    .limit(RECENT_ORDERS_LIMIT);

  return { customer, metrics, recentOrders };
}

/**
 * Updates a customer's dashboard-only internal notes. An empty/whitespace value
 * or null clears them. Returns the full refreshed details. Throws NotFound when
 * the customer does not belong to the store.
 */
export async function updateCustomerNotes(
  storeId: string,
  id: string,
  input: UpdateCustomerNotesInput,
): Promise<CustomerDetails> {
  const trimmed = input.internalNotes?.trim();
  const internalNotes = trimmed ? trimmed : null;

  const [updated] = await db
    .update(customers)
    .set({ internalNotes, updatedAt: new Date() })
    .where(and(eq(customers.storeId, storeId), eq(customers.id, id)))
    .returning({ id: customers.id });

  if (!updated) {
    throw new NotFoundError("Customer not found");
  }

  const details = await getCustomerDetails(storeId, id);
  if (!details) {
    // The row existed a moment ago; a missing read here is a real error.
    throw new NotFoundError("Customer not found");
  }
  return details;
}
