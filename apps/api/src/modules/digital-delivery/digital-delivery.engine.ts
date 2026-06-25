import { and, count, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, type DbTransaction } from "../../db";
import { codeAssignments } from "../../db/schema/code-assignments";
import { digitalCodes } from "../../db/schema/digital-codes";
import { digitalProductSettings } from "../../db/schema/digital-product-settings";
import { orderItems } from "../../db/schema/order-items";
import {
  orders,
  type OrderDigitalDeliveryStatus,
} from "../../db/schema/orders";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import type { AuditAction, AuditEntityType } from "../../db/schema/audit-logs";
import { NotFoundError } from "../../lib/errors";
import { createNotification } from "../notifications/notifications.service";
import type { AssignItemDto } from "./digital-delivery.serializer";

export interface AssignEngineOptions {
  /** Assign what stock exists per product (remainder flagged) vs. all-or-nothing. */
  allowPartial: boolean;
  /** Acting dashboard user, or null for the system/webhook path. */
  actorUserId: string | null;
  /**
   * Webhook path: only assign products whose `reserve_on_statuses` includes the
   * order's current status. The manual endpoint passes false (staff override).
   */
  respectReserveStatus: boolean;
  /** Optional operator note, stored on the created assignment rows. */
  reason?: string | null;
}

export interface AssignEngineResult {
  orderId: string;
  status: OrderDigitalDeliveryStatus;
  requiredCodes: number;
  assignedCodes: number;
  newlyAssigned: number;
  items: AssignItemDto[];
  shortfall: boolean;
  /** True when the order has no digital-enabled products at all. */
  notApplicable: boolean;
}

/** Deterministic pool ordering for code selection (plan2 §17). Fixed fragments — no user input. */
function poolOrder(strategy: string): SQL {
  switch (strategy) {
    case "lifo":
      return sql`${digitalCodes.createdAt} desc, ${digitalCodes.id} desc`;
    case "earliest_expiry":
      return sql`${digitalCodes.expiresAt} asc nulls last, ${digitalCodes.createdAt} asc`;
    case "random":
      return sql`random()`;
    case "fifo":
    default:
      return sql`${digitalCodes.createdAt} asc, ${digitalCodes.id} asc`;
  }
}

/**
 * Derives the order-level digital delivery status. `attempted` means at least one
 * eligible product was processed this run — distinguishing "tried but short of
 * stock" (manual_review) from "not yet eligible" (pending).
 */
export function deriveOrderDigitalStatus(
  requiredCodes: number,
  assignedCodes: number,
  attempted: boolean,
): OrderDigitalDeliveryStatus {
  if (requiredCodes === 0) return "not_required";
  if (assignedCodes >= requiredCodes) return "completed";
  if (assignedCodes > 0) return "partial";
  return attempted ? "manual_review" : "pending";
}

export interface AssignmentAuditEntry {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  message: string;
  metadata: Record<string, unknown>;
}

/**
 * Maps an engine result to an audit entry (or null when nothing audit-worthy
 * happened, e.g. a not-applicable order). Carries ids/counts only — never codes.
 */
export function buildAssignmentAuditEntry(
  result: AssignEngineResult,
): AssignmentAuditEntry | null {
  if (result.notApplicable || result.requiredCodes === 0) return null;

  const metadata = {
    orderId: result.orderId,
    requiredCodes: result.requiredCodes,
    assignedCodes: result.assignedCodes,
    newlyAssigned: result.newlyAssigned,
    productIds: result.items.map((i) => i.productId),
  };

  let action: AuditAction;
  let message: string;
  if (result.assignedCodes >= result.requiredCodes) {
    action = AUDIT_ACTIONS.DIGITAL_CODES_ASSIGNED;
    message = "عيّن الأكواد الرقمية للطلب";
  } else if (result.assignedCodes > 0) {
    action = AUDIT_ACTIONS.DIGITAL_ASSIGNMENT_PARTIAL;
    message = "تعيين جزئي للأكواد الرقمية";
  } else {
    action = AUDIT_ACTIONS.DIGITAL_ASSIGNMENT_FAILED;
    message = "فشل تعيين الأكواد الرقمية";
  }

  return {
    action,
    entityType: AUDIT_ENTITY_TYPES.DIGITAL_DELIVERY,
    entityId: result.orderId,
    message,
    metadata,
  };
}

interface DigitalProductNeed {
  productId: string;
  productName: string;
  representativeOrderItemId: string;
  required: number;
  strategy: string;
  maxPerItem: number;
  reserveOnStatuses: string[];
  eligible: boolean;
}

/**
 * Reserves and assigns digital codes to an order's items (plan2 §17). The core
 * of digital fulfillment, written to be SAFE and IDEMPOTENT:
 *
 *  - Tenant-scoped: every query filters by `store_id`.
 *  - Idempotent: accounting keys on the STABLE (order_id, product_id) — re-running
 *    (e.g. on every order.updated webhook) never double-assigns, since already
 *    assigned codes are counted and `missing` drops to zero. Survives the order
 *    sync replacing order_items wholesale.
 *  - No double-sell: available codes are locked with `FOR UPDATE SKIP LOCKED`,
 *    flipped to `sold` in the same transaction, and the partial-unique index on
 *    code_assignments guarantees a code can hold at most one active assignment.
 *
 * Phase 17 only assigns (status `sold` + a `code_assignments` row). Delivery —
 * moving codes to `delivered` and sending them — is Phase 18.
 */
export async function assignCodesForOrder(
  storeId: string,
  orderId: string,
  options: AssignEngineOptions,
): Promise<AssignEngineResult> {
  const [order] = await db
    .select({
      id: orders.id,
      status: orders.status,
      customerId: orders.customerId,
    })
    .from(orders)
    .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
    .limit(1);
  if (!order) {
    throw new NotFoundError("Order not found");
  }

  // Digital-enabled products in this order, with required quantity (summed across
  // lines) and a representative line item. Eligibility (reserve_on_statuses) only
  // gates the WEBHOOK path; the manual endpoint assigns regardless.
  const lines = await db
    .select({
      productId: orderItems.productId,
      orderItemId: orderItems.id,
      quantity: orderItems.quantity,
      productName: orderItems.name,
      isEnabled: digitalProductSettings.isEnabled,
      strategy: digitalProductSettings.codePoolStrategy,
      maxPerItem: digitalProductSettings.maxCodesPerOrderItem,
      reserveOnStatuses: digitalProductSettings.reserveOnStatuses,
    })
    .from(orderItems)
    .innerJoin(
      digitalProductSettings,
      and(
        eq(digitalProductSettings.storeId, orderItems.storeId),
        eq(digitalProductSettings.productId, orderItems.productId),
      ),
    )
    .where(and(eq(orderItems.storeId, storeId), eq(orderItems.orderId, orderId)));

  const needs = new Map<string, DigitalProductNeed>();
  for (const line of lines) {
    if (!line.productId || !line.isEnabled) continue;
    const existing = needs.get(line.productId);
    if (existing) {
      existing.required += line.quantity;
      continue;
    }
    const reserveOnStatuses = line.reserveOnStatuses ?? [];
    needs.set(line.productId, {
      productId: line.productId,
      productName: line.productName,
      representativeOrderItemId: line.orderItemId,
      required: line.quantity,
      strategy: line.strategy,
      maxPerItem: line.maxPerItem,
      reserveOnStatuses,
      eligible: options.respectReserveStatus
        ? reserveOnStatuses.includes(order.status)
        : true,
    });
  }

  // No digital products → mark not_required and exit (no assignment attempted).
  if (needs.size === 0) {
    await db
      .update(orders)
      .set({
        digitalDeliveryRequired: false,
        digitalDeliveryStatus: "not_required",
        digitalDeliveryCompletedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)));
    return {
      orderId,
      status: "not_required",
      requiredCodes: 0,
      assignedCodes: 0,
      newlyAssigned: 0,
      items: [],
      shortfall: false,
      notApplicable: true,
    };
  }

  // Existing active assignments per product for this order (idempotency basis).
  const existingRows = await db
    .select({ productId: codeAssignments.productId, value: count() })
    .from(codeAssignments)
    .where(
      and(
        eq(codeAssignments.storeId, storeId),
        eq(codeAssignments.orderId, orderId),
        inArray(codeAssignments.status, ["assigned", "delivered"]),
      ),
    )
    .groupBy(codeAssignments.productId);
  const existingByProduct = new Map<string, number>();
  for (const row of existingRows) {
    existingByProduct.set(row.productId, Number(row.value));
  }

  const now = new Date();
  let attempted = false;

  const newlyByProduct = await db.transaction(async (tx) => {
    const assignedNow = new Map<string, number>();
    for (const need of needs.values()) {
      if (!need.eligible) continue;
      attempted = true;

      const alreadyAssigned = existingByProduct.get(need.productId) ?? 0;
      const missing = need.required - alreadyAssigned;
      if (missing <= 0) continue;

      const take = Math.min(missing, need.maxPerItem);
      if (take <= 0) continue;

      const lockedIds = await lockAvailableCodes(
        tx,
        storeId,
        need.productId,
        need.strategy,
        take,
      );

      // All-or-nothing for the product when partial is disallowed.
      if (!options.allowPartial && lockedIds.length < missing) {
        continue;
      }
      if (lockedIds.length === 0) continue;

      const updated = await tx
        .update(digitalCodes)
        .set({
          status: "sold",
          assignedOrderId: orderId,
          assignedOrderItemId: need.representativeOrderItemId,
          assignedCustomerId: order.customerId,
          soldAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(digitalCodes.storeId, storeId),
            inArray(digitalCodes.id, lockedIds),
            eq(digitalCodes.status, "available"),
          ),
        )
        .returning({ id: digitalCodes.id });

      if (updated.length > 0) {
        await tx.insert(codeAssignments).values(
          updated.map((u) => ({
            storeId,
            codeId: u.id,
            productId: need.productId,
            orderId,
            orderItemId: need.representativeOrderItemId,
            customerId: order.customerId,
            assignmentType: "sale",
            status: "assigned",
            assignedBy: options.actorUserId,
            notes: options.reason ?? null,
          })),
        );
      }
      assignedNow.set(need.productId, updated.length);
    }

    // Build the per-product result + order status inside the same transaction.
    const items: AssignItemDto[] = [];
    let requiredCodes = 0;
    let assignedCodes = 0;
    let newlyAssigned = 0;
    for (const need of needs.values()) {
      const newly = assignedNow.get(need.productId) ?? 0;
      const assigned = (existingByProduct.get(need.productId) ?? 0) + newly;
      requiredCodes += need.required;
      assignedCodes += assigned;
      newlyAssigned += newly;
      items.push({
        productId: need.productId,
        productName: need.productName,
        orderItemId: need.representativeOrderItemId,
        required: need.required,
        assigned,
        missing: Math.max(0, need.required - assigned),
      });
    }

    const status = deriveOrderDigitalStatus(
      requiredCodes,
      assignedCodes,
      attempted,
    );
    await tx
      .update(orders)
      .set({
        digitalDeliveryRequired: true,
        digitalDeliveryStatus: status,
        digitalDeliveryCompletedAt: status === "completed" ? now : null,
        updatedAt: now,
      })
      .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)));

    return { items, requiredCodes, assignedCodes, newlyAssigned, status };
  });

  const shortfall = newlyByProduct.assignedCodes < newlyByProduct.requiredCodes;

  const result: AssignEngineResult = {
    orderId,
    status: newlyByProduct.status,
    requiredCodes: newlyByProduct.requiredCodes,
    assignedCodes: newlyByProduct.assignedCodes,
    newlyAssigned: newlyByProduct.newlyAssigned,
    items: newlyByProduct.items,
    shortfall,
    notApplicable: false,
  };

  await notifyOnShortfall(storeId, result, attempted);
  return result;
}

/** Locks up to `limit` available codes for a product (FOR UPDATE SKIP LOCKED). */
async function lockAvailableCodes(
  tx: DbTransaction,
  storeId: string,
  productId: string,
  strategy: string,
  limit: number,
): Promise<string[]> {
  const locked = await tx.execute(sql`
    select ${digitalCodes.id} as id
    from ${digitalCodes}
    where ${digitalCodes.storeId} = ${storeId}
      and ${digitalCodes.productId} = ${productId}
      and ${digitalCodes.status} = 'available'
    order by ${poolOrder(strategy)}
    limit ${limit}
    for update skip locked
  `);
  return (locked.rows as { id: string }[]).map((r) => r.id);
}

/**
 * Best-effort notification when an order could not be fully assigned. Never
 * throws — a notification failure must not break the assignment.
 */
async function notifyOnShortfall(
  storeId: string,
  result: AssignEngineResult,
  attempted: boolean,
): Promise<void> {
  if (!result.shortfall || !attempted) return;
  const title =
    result.assignedCodes === 0
      ? "لا توجد أكواد كافية"
      : "طلب يحتاج مراجعة يدوية";
  try {
    await createNotification({
      storeId,
      type: "digital_inventory",
      title,
      message: `الطلب يحتاج ${result.requiredCodes} كود وتم تعيين ${result.assignedCodes} فقط.`,
      severity: "warning",
      metadata: {
        orderId: result.orderId,
        requiredCodes: result.requiredCodes,
        assignedCodes: result.assignedCodes,
      },
    });
  } catch {
    // best-effort
  }
}
