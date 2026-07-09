import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { orders, type OrderRow } from "../../db/schema/orders";
import {
  orderRefunds,
  type OrderRefundRow,
} from "../../db/schema/order-refunds";
import { wpCommands } from "../../db/schema/wp-commands";
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from "../../lib/errors";
import { getConnectionByStoreId } from "../connections/connections.service";
import { wpRequest } from "../connections/wp-client";
import { runWpCommandOrThrow } from "../wp-commands/wp-commands.service";
import { applyOrderDigitalSideEffects } from "../digital-delivery/order-side-effects";
import type {
  AddOrderWpNoteInput,
  CreateOrderRefundInput,
} from "./orders.schemas";

/**
 * Order write-back to WooCommerce (Phase 27, plan3): status transitions, order
 * notes and refunds. Every mutation flows through the command outbox; reads
 * (note listing) call the connector directly. After a successful command the
 * mirror row updates from the connector's response and the digital-fulfillment
 * side effects run through the SAME seam the webhook handler uses — the echo
 * of our own command is suppressed, so this is the only place they run.
 */

/** Connector response for PUT /orders/{id}/status. */
const statusResultSchema = z.object({
  wpOrderId: z.number().int().positive(),
  status: z.string().trim().max(40),
  entityVersion: z.string().trim().max(64).optional(),
  totalRefunded: z.union([z.string(), z.number()]).optional(),
});

/** Connector response for POST /orders/{id}/refunds. */
const refundResultSchema = z.object({
  wpRefundId: z.number().int().positive(),
  amount: z.union([z.string(), z.number()]),
  reason: z.string().max(500).nullish(),
  refundedPayment: z.boolean().default(false),
  orderStatus: z.string().trim().max(40),
  totalRefunded: z.union([z.string(), z.number()]),
  entityVersion: z.string().trim().max(64).optional(),
  dateCreated: z.string().max(64).nullish(),
});

/** One WooCommerce order note as returned by the connector. */
export interface OrderWpNote {
  noteId: number;
  note: string;
  customerNote: boolean;
  addedBy: string | null;
  dateCreated: string | null;
}

const notesResultSchema = z.object({
  items: z
    .array(
      z.object({
        noteId: z.number().int().positive(),
        note: z.string(),
        customerNote: z.boolean().default(false),
        addedBy: z.string().max(200).nullish(),
        dateCreated: z.string().max(64).nullish(),
      }),
    )
    .default([]),
});

const noteCreatedSchema = z.object({
  noteId: z.number().int().positive(),
  customerNote: z.boolean().default(false),
});

/** Loads a store's order and requires it to be linked to WooCommerce. */
async function requireLinkedOrder(
  storeId: string,
  orderId: string,
): Promise<OrderRow & { wpOrderId: number }> {
  const [row] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
    .limit(1);
  if (!row) {
    throw new NotFoundError("Order not found");
  }
  if (!row.wpOrderId) {
    throw new ValidationError(
      "This order is not linked to a WooCommerce order.",
    );
  }
  return row as OrderRow & { wpOrderId: number };
}

function toMoneyString(value: string | number | undefined): string | null {
  if (value === undefined) return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : null;
}

/**
 * True when an error is the Postgres unique-violation (23505) from the
 * in-flight-refund partial unique index — i.e. a concurrent refund lost the
 * race. Any other error is rethrown unchanged.
 */
function isRefundInFlightConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; constraint?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const constraint = typeof e.constraint === "string" ? e.constraint : "";
  const message = typeof e.message === "string" ? e.message : "";
  return (
    code === "23505" &&
    (constraint === "wp_commands_refund_in_flight_unique" ||
      message.includes("wp_commands_refund_in_flight_unique"))
  );
}

export interface StatusChangeResult {
  order: OrderRow;
  previousStatus: string;
}

/**
 * Changes an order's status IN WooCommerce (compare-and-set) and updates the
 * mirror from the connector response. WooCommerce runs all its usual
 * transition side effects (emails, stock, plugin hooks); the SaaS then runs
 * the digital-fulfillment seam exactly as a webhook-driven change would.
 */
export async function updateOrderStatusInWp(
  storeId: string,
  orderId: string,
  status: string,
  userId: string,
): Promise<StatusChangeResult> {
  const order = await requireLinkedOrder(storeId, orderId);
  const previousStatus = order.status;

  if (previousStatus === status) {
    throw new ValidationError("The order already has this status.");
  }

  const command = await runWpCommandOrThrow({
    storeId,
    domain: "order",
    action: "update_status",
    targetWpId: order.wpOrderId,
    payload: { status },
    // Money-sensitive transitions MUST compare-and-set (plan3 §2.1); when the
    // mirror has no version yet (old connector data) the connector skips the
    // check rather than rejecting everything.
    expectedVersion: order.wpVersion,
    createdBy: userId,
  });

  const result = statusResultSchema.safeParse(command.result);
  if (!result.success) {
    throw new ServiceUnavailableError(
      "WooCommerce confirmed the status change but returned an unexpected response.",
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(orders)
    .set({
      status: result.data.status,
      wpVersion: result.data.entityVersion ?? order.wpVersion,
      ...(toMoneyString(result.data.totalRefunded)
        ? { totalRefunded: toMoneyString(result.data.totalRefunded)! }
        : {}),
      lastSyncedAt: now,
      updatedAt: now,
    })
    .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
    .returning();
  if (!updated) {
    throw new NotFoundError("Order not found");
  }

  await applyOrderDigitalSideEffects(storeId, orderId, updated.status);

  return { order: updated, previousStatus };
}

/** Lists an order's WooCommerce notes (live read through the connector). */
export async function listOrderWpNotes(
  storeId: string,
  orderId: string,
): Promise<OrderWpNote[]> {
  const order = await requireLinkedOrder(storeId, orderId);
  const connection = await getConnectionByStoreId(storeId);
  if (!connection || connection.status !== "connected" || !connection.siteUrl) {
    throw new ServiceUnavailableError(
      "Store is not connected to WordPress. Connect the store first.",
    );
  }
  const result = await wpRequest(
    connection,
    "GET",
    `orders/${order.wpOrderId}/notes`,
  );
  if (!result.ok) {
    throw new ServiceUnavailableError(
      `Failed to load order notes from WooCommerce: ${result.message}`,
    );
  }
  const parsed = notesResultSchema.safeParse(result.data);
  if (!parsed.success) {
    throw new ServiceUnavailableError(
      "WooCommerce returned an unexpected notes response.",
    );
  }
  return parsed.data.items.map((item) => ({
    noteId: item.noteId,
    note: item.note,
    customerNote: item.customerNote,
    addedBy: item.addedBy ?? null,
    dateCreated: item.dateCreated ?? null,
  }));
}

/** Adds a WooCommerce order note (private or customer-facing) via the outbox. */
export async function addOrderWpNote(
  storeId: string,
  orderId: string,
  input: AddOrderWpNoteInput,
  userId: string,
): Promise<{ noteId: number; customerNote: boolean }> {
  const order = await requireLinkedOrder(storeId, orderId);
  const command = await runWpCommandOrThrow({
    storeId,
    domain: "order",
    action: "add_note",
    targetWpId: order.wpOrderId,
    payload: { note: input.note, customerNote: input.customerNote },
    createdBy: userId,
  });
  const parsed = noteCreatedSchema.safeParse(command.result);
  if (!parsed.success) {
    throw new ServiceUnavailableError(
      "WooCommerce confirmed the note but returned an unexpected response.",
    );
  }
  return parsed.data;
}

export interface CreateRefundResult {
  refund: OrderRefundRow;
  order: OrderRow;
}

/**
 * Creates a WooCommerce refund via the command outbox (plan3 §2.2 money rules):
 *  - amount validated against the remaining refundable amount on BOTH sides;
 *  - a stable idempotency key travels with every attempt and the connector
 *    keys the refund itself on it, so a retry can never refund twice;
 *  - only one in-flight refund command per order (double-submit guard);
 *  - `refundPayment` (real money movement) is permission-checked in the route
 *    layer against orders.refund_payment before this service runs.
 */
export async function createOrderRefundInWp(
  storeId: string,
  orderId: string,
  input: CreateOrderRefundInput,
  userId: string,
): Promise<CreateRefundResult> {
  const order = await requireLinkedOrder(storeId, orderId);

  const remaining =
    Number(order.total) - Number(order.totalRefunded ?? "0");
  if (input.amount > remaining + 0.005) {
    throw new ValidationError(
      `Refund amount exceeds the remaining refundable amount (${remaining.toFixed(2)} ${order.currency}).`,
    );
  }

  // Concurrency guard: a partial unique index on wp_commands enforces at MOST
  // one in-flight (pending/sending) refund command per order at the DB level,
  // so two concurrent submits cannot both pass a check-then-act guard. The
  // fast pre-check below just gives a friendly error on the common (sequential)
  // case; the DB index is the real guarantee against the race (Phase 32 audit).
  const [inFlight] = await db
    .select({ id: wpCommands.id, status: wpCommands.status })
    .from(wpCommands)
    .where(
      and(
        eq(wpCommands.storeId, storeId),
        eq(wpCommands.domain, "order"),
        eq(wpCommands.action, "create_refund"),
        eq(wpCommands.targetWpId, order.wpOrderId),
      ),
    )
    .orderBy(desc(wpCommands.createdAt))
    .limit(1);
  if (inFlight && (inFlight.status === "pending" || inFlight.status === "sending")) {
    throw new ConflictError(
      "A refund for this order is already being processed.",
    );
  }

  let command;
  try {
    command = await runWpCommandOrThrow({
      storeId,
      domain: "order",
      action: "create_refund",
      // Stable key so a client retry of the SAME refund reuses this command
      // row (idempotency) — the connector then finds its already-created
      // WooCommerce refund instead of moving money again.
      idempotencyKey: input.idempotencyKey,
      targetWpId: order.wpOrderId,
      payload: {
        amount: input.amount.toFixed(2),
        reason: input.reason ?? "",
        refundPayment: input.refundPayment,
        restockItems: input.restockItems,
        currency: order.currency,
      },
      createdBy: userId,
    });
  } catch (err) {
    // The DB in-flight unique index rejected a concurrent second refund.
    if (isRefundInFlightConflict(err)) {
      throw new ConflictError(
        "A refund for this order is already being processed.",
      );
    }
    throw err;
  }

  const parsed = refundResultSchema.safeParse(command.result);
  if (!parsed.success) {
    throw new ServiceUnavailableError(
      "WooCommerce confirmed the refund but returned an unexpected response.",
    );
  }
  const data = parsed.data;

  const now = new Date();
  const wpDateCreated = data.dateCreated ? new Date(data.dateCreated) : null;

  // Mirror row: keyed by (store, wp_refund_id) — a replayed command or the
  // later sync of the same refund converges on this row instead of duplicating.
  const [existingMirror] = await db
    .select()
    .from(orderRefunds)
    .where(
      and(
        eq(orderRefunds.storeId, storeId),
        eq(orderRefunds.wpRefundId, data.wpRefundId),
      ),
    )
    .limit(1);

  let refundRow: OrderRefundRow;
  if (existingMirror) {
    refundRow = existingMirror;
  } else {
    const [inserted] = await db
      .insert(orderRefunds)
      .values({
        storeId,
        orderId,
        wpRefundId: data.wpRefundId,
        amount: toMoneyString(data.amount) ?? input.amount.toFixed(2),
        currency: order.currency,
        reason: data.reason ?? input.reason ?? null,
        refundedPayment: data.refundedPayment,
        initiatedBy: "saas",
        createdBy: userId,
        wpDateCreated:
          wpDateCreated && !Number.isNaN(wpDateCreated.getTime())
            ? wpDateCreated
            : null,
      })
      .returning();
    if (!inserted) {
      throw new Error("Failed to record the refund mirror row");
    }
    refundRow = inserted;
  }

  const [updatedOrder] = await db
    .update(orders)
    .set({
      status: data.orderStatus,
      totalRefunded:
        toMoneyString(data.totalRefunded) ?? order.totalRefunded,
      wpVersion: data.entityVersion ?? order.wpVersion,
      lastSyncedAt: now,
      updatedAt: now,
    })
    .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
    .returning();
  if (!updatedOrder) {
    throw new NotFoundError("Order not found");
  }

  // A full refund flips the order to "refunded" — release digital codes
  // through the same seam the webhook path uses.
  await applyOrderDigitalSideEffects(storeId, orderId, updatedOrder.status);

  return { refund: refundRow, order: updatedOrder };
}

/** Lists the refund mirror rows for one order, newest first. */
export async function listOrderRefunds(
  storeId: string,
  orderId: string,
): Promise<OrderRefundRow[]> {
  // Ensure the order exists within the tenant before exposing refunds.
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
    .limit(1);
  if (!row) {
    throw new NotFoundError("Order not found");
  }
  return db
    .select()
    .from(orderRefunds)
    .where(
      and(eq(orderRefunds.storeId, storeId), eq(orderRefunds.orderId, orderId)),
    )
    .orderBy(desc(orderRefunds.createdAt));
}
