import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { codeAssignments } from "../../db/schema/code-assignments";
import { digitalCodes } from "../../db/schema/digital-codes";
import { digitalProductSettings } from "../../db/schema/digital-product-settings";
import { orderItems } from "../../db/schema/order-items";
import { orders } from "../../db/schema/orders";
import { products } from "../../db/schema/products";
import { logger } from "../../lib/logger";
import { NotFoundError } from "../../lib/errors";
import { escapeLike } from "../../lib/sql";
import { recordAuditLog } from "../audit-logs/audit-logs.service";
import {
  assignCodesForOrder,
  buildAssignmentAuditEntry,
  type AssignEngineResult,
} from "./digital-delivery.engine";
import type {
  AssignmentRowWithNames,
  QueueItemDto,
} from "./digital-delivery.serializer";
import type { QueueQuery } from "./digital-delivery.schemas";

/**
 * Webhook seam (plan2 §17). Best-effort: when an order is processed and its
 * status makes some product eligible (`reserve_on_statuses`), reserve/assign
 * codes. NEVER throws — the order sync has already succeeded, so an assignment
 * problem must not fail the webhook; it is logged and surfaced via notification.
 */
export async function maybeAssignCodesForOrder(
  storeId: string,
  orderId: string,
): Promise<void> {
  try {
    const result = await assignCodesForOrder(storeId, orderId, {
      allowPartial: true,
      actorUserId: null,
      respectReserveStatus: true,
    });
    const entry = buildAssignmentAuditEntry(result);
    if (entry) {
      // System action (no acting user) — recorder is itself best-effort.
      await recordAuditLog({
        storeId,
        userId: null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        message: entry.message,
        metadata: entry.metadata,
        ipAddress: null,
        userAgent: null,
      });
    }
  } catch (err) {
    logger.error({ err, storeId, orderId }, "Auto code assignment failed");
  }
}

/** Verifies an order belongs to the store; throws 404 otherwise. */
async function getOwnedOrder(storeId: string, orderId: string) {
  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      digitalDeliveryStatus: orders.digitalDeliveryStatus,
      digitalDeliveryRequired: orders.digitalDeliveryRequired,
    })
    .from(orders)
    .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
    .limit(1);
  if (!order) {
    throw new NotFoundError("Order not found");
  }
  return order;
}

export interface OrderAssignmentsView {
  orderId: string;
  orderNumber: string | null;
  orderStatus: string;
  digitalDeliveryStatus: string;
  requiredCodes: number;
  assignedCodes: number;
  assignments: AssignmentRowWithNames[];
}

/**
 * Returns an order's masked assignments plus its digital fulfillment summary.
 * Tenant-scoped (404 for a cross-store order). Never exposes raw code material.
 */
export async function getOrderAssignments(
  storeId: string,
  orderId: string,
): Promise<OrderAssignmentsView> {
  const order = await getOwnedOrder(storeId, orderId);

  const rows = await db
    .select({
      assignment: codeAssignments,
      codePreview: digitalCodes.codePreview,
      productName: products.name,
    })
    .from(codeAssignments)
    .leftJoin(digitalCodes, eq(digitalCodes.id, codeAssignments.codeId))
    .leftJoin(products, eq(products.id, codeAssignments.productId))
    .where(
      and(
        eq(codeAssignments.storeId, storeId),
        eq(codeAssignments.orderId, orderId),
      ),
    )
    .orderBy(desc(codeAssignments.createdAt), desc(codeAssignments.id));

  const [requiredAgg] = await db
    .select({ value: sql<number>`coalesce(sum(${orderItems.quantity}), 0)` })
    .from(orderItems)
    .innerJoin(
      digitalProductSettings,
      and(
        eq(digitalProductSettings.storeId, orderItems.storeId),
        eq(digitalProductSettings.productId, orderItems.productId),
        eq(digitalProductSettings.isEnabled, true),
      ),
    )
    .where(and(eq(orderItems.storeId, storeId), eq(orderItems.orderId, orderId)));

  const [assignedAgg] = await db
    .select({ value: count() })
    .from(codeAssignments)
    .where(
      and(
        eq(codeAssignments.storeId, storeId),
        eq(codeAssignments.orderId, orderId),
        inArray(codeAssignments.status, ["assigned", "delivered"]),
      ),
    );

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderStatus: order.status,
    digitalDeliveryStatus: order.digitalDeliveryStatus,
    requiredCodes: Number(requiredAgg?.value ?? 0),
    assignedCodes: Number(assignedAgg?.value ?? 0),
    assignments: rows,
  };
}

export interface QueueResult {
  items: QueueItemDto[];
  total: number;
  page: number;
  limit: number;
}

/**
 * The digital delivery queue: orders that need digital codes, with live-computed
 * required/assigned counts and a derived status. Computed live (not from the
 * stored flag) so it is correct even for orders the engine has not processed yet.
 * Tenant-scoped; filterable by derived status and order-number / customer search.
 */
export async function listQueue(
  storeId: string,
  query: QueueQuery,
): Promise<QueueResult> {
  const offset = (query.page - 1) * query.limit;
  const statusParam = query.status ?? null;
  const searchParam = query.search ? `%${escapeLike(query.search)}%` : null;

  // Shared CTE: digital orders (required > 0) with their derived status.
  const cte = sql`
    with digital_orders as (
      select o.id, o.order_number, o.status as order_status, o.created_at,
             o.digital_delivery_status, c.name as customer_name,
             (select coalesce(sum(oi.quantity), 0)::int
                from order_items oi
                join digital_product_settings dps
                  on dps.product_id = oi.product_id
                 and dps.store_id = oi.store_id
                 and dps.is_enabled = true
               where oi.order_id = o.id) as required_codes,
             (select count(*)::int
                from code_assignments ca
               where ca.order_id = o.id
                 and ca.store_id = o.store_id
                 and ca.status in ('assigned', 'delivered')) as assigned_codes
        from orders o
        left join customers c on c.id = o.customer_id
       where o.store_id = ${storeId}
    ),
    classified as (
      select *, (case
        when assigned_codes >= required_codes then 'completed'
        when digital_delivery_status = 'manual_review' then 'manual_review'
        when assigned_codes > 0 then 'partial'
        else 'pending' end) as computed_status
        from digital_orders
       where required_codes > 0
    )`;

  const filter = sql`
    where (${statusParam}::text is null or computed_status = ${statusParam})
      and (${searchParam}::text is null
           or order_number ilike ${searchParam}
           or customer_name ilike ${searchParam})`;

  const dataResult = await db.execute(sql`
    ${cte}
    select id, order_number, order_status, digital_delivery_status,
           customer_name, required_codes, assigned_codes, computed_status,
           created_at
      from classified
      ${filter}
     order by created_at desc, id desc
     limit ${query.limit} offset ${offset}`);

  const countResult = await db.execute(sql`
    ${cte}
    select count(*)::int as total from classified ${filter}`);

  const rows = dataResult.rows as Array<{
    id: string;
    order_number: string | null;
    order_status: string;
    digital_delivery_status: string;
    customer_name: string | null;
    required_codes: number;
    assigned_codes: number;
    computed_status: string;
    created_at: Date;
  }>;

  const items: QueueItemDto[] = rows.map((r) => ({
    orderId: r.id,
    orderNumber: r.order_number,
    customerName: r.customer_name,
    orderStatus: r.order_status,
    digitalDeliveryStatus: r.computed_status,
    requiredCodes: Number(r.required_codes),
    assignedCodes: Number(r.assigned_codes),
    createdAt: r.created_at,
  }));

  const total = Number(
    (countResult.rows as Array<{ total: number }>)[0]?.total ?? 0,
  );

  return { items, total, page: query.page, limit: query.limit };
}

/** Re-export so callers import the engine through the module's service surface. */
export { assignCodesForOrder, type AssignEngineResult };
