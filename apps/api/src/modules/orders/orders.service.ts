import { and, count, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { customers, type CustomerRow } from "../../db/schema/customers";
import { orderItems, type OrderItemRow } from "../../db/schema/order-items";
import { orders, type OrderRow } from "../../db/schema/orders";
import { NotFoundError } from "../../lib/errors";
import { escapeLike } from "../../lib/sql";
import type { ListOrdersQuery, UpdateOrderNotesInput } from "./orders.schemas";

/**
 * Effective order date: the WooCommerce placed-at when known, otherwise our
 * created-at. Used for both date-range filtering and ordering so the list shows
 * the most recent orders first regardless of which timestamp is populated.
 */
const orderDate = sql`coalesce(${orders.placedAt}, ${orders.createdAt})`;

/**
 * Date bounds are computed in UTC to match how `z.coerce.date()` parses the
 * incoming `YYYY-MM-DD` strings (UTC midnight). Using local time here would
 * shift the boundary by the server's offset and drop edge-of-day orders.
 */
function startOfDayUtc(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

/** Start of the day AFTER `date` (UTC) — an exclusive upper bound that makes
 * the requested `dateTo` calendar day fully inclusive. */
function startOfNextDayUtc(date: Date): Date {
  const copy = startOfDayUtc(date);
  copy.setUTCDate(copy.getUTCDate() + 1);
  return copy;
}

export interface OrderWithCustomer {
  order: OrderRow;
  customer: CustomerRow | null;
}

export interface ListOrdersResult {
  items: OrderWithCustomer[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Lists a store's orders with optional search, status filter, date range and
 * pagination. Joins the linked customer so the list can show buyer names and so
 * search can match customer name/email/phone in addition to the order number.
 */
export async function listOrders(
  storeId: string,
  query: ListOrdersQuery,
): Promise<ListOrdersResult> {
  const conditions = [eq(orders.storeId, storeId)];

  if (query.status) {
    conditions.push(eq(orders.status, query.status));
  }
  if (query.search) {
    const term = `%${escapeLike(query.search)}%`;
    const match = or(
      ilike(orders.orderNumber, term),
      ilike(customers.name, term),
      ilike(customers.email, term),
      ilike(customers.phone, term),
    );
    if (match) conditions.push(match);
  }
  if (query.dateFrom) {
    conditions.push(gte(orderDate, startOfDayUtc(query.dateFrom)));
  }
  if (query.dateTo) {
    conditions.push(lt(orderDate, startOfNextDayUtc(query.dateTo)));
  }

  const whereClause = and(...conditions);
  const offset = (query.page - 1) * query.limit;

  const [rows, totals] = await Promise.all([
    db
      .select({ order: orders, customer: customers })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(whereClause)
      // Deterministic order: effective date desc, then a stable id tiebreaker so
      // rows with an identical date (e.g. a sync batch sharing created_at) never
      // shuffle across page boundaries.
      .orderBy(sql`${orderDate} desc`, desc(orders.id))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(whereClause),
  ]);

  return {
    items: rows.map((r) => ({ order: r.order, customer: r.customer })),
    total: Number(totals[0]?.value ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

export interface OrderDetails {
  order: OrderRow;
  customer: CustomerRow | null;
  items: OrderItemRow[];
}

/** Fetches one order with its customer and line items, scoped to the store. */
export async function getOrderDetails(
  storeId: string,
  id: string,
): Promise<OrderDetails | null> {
  const [row] = await db
    .select({ order: orders, customer: customers })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(and(eq(orders.storeId, storeId), eq(orders.id, id)))
    .limit(1);

  if (!row) return null;

  const items = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.storeId, storeId), eq(orderItems.orderId, id)))
    .orderBy(orderItems.createdAt);

  return { order: row.order, customer: row.customer, items };
}

/**
 * Updates an order's dashboard-only internal notes. An empty string or null
 * clears them. Returns the full refreshed order details. Throws NotFound when
 * the order does not belong to the store.
 */
export async function updateOrderNotes(
  storeId: string,
  id: string,
  input: UpdateOrderNotesInput,
): Promise<OrderDetails> {
  // null, undefined, empty, or whitespace-only all clear the notes to null so
  // the column never holds a meaningless empty string.
  const trimmed = input.internalNotes?.trim();
  const internalNotes = trimmed ? trimmed : null;

  const [updated] = await db
    .update(orders)
    .set({ internalNotes, updatedAt: new Date() })
    .where(and(eq(orders.storeId, storeId), eq(orders.id, id)))
    .returning({ id: orders.id });

  if (!updated) {
    throw new NotFoundError("Order not found");
  }

  const details = await getOrderDetails(storeId, id);
  if (!details) {
    // The row existed a moment ago; a missing read here is a real error.
    throw new NotFoundError("Order not found");
  }
  return details;
}
