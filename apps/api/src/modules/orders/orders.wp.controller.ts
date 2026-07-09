import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { ForbiddenError } from "../../lib/errors";
import { getAuth } from "../../middleware/authenticate";
import { loadPermissionKeys } from "../rbac/rbac.service";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import { recordAuditFromRequest } from "../audit-logs/audit-logs.recorder";
import { toOrderDto, toOrderRefundDto } from "./orders.serializer";
import type {
  AddOrderWpNoteInput,
  CreateOrderRefundInput,
  OrderParams,
  UpdateOrderStatusInput,
} from "./orders.schemas";
import {
  addOrderWpNote,
  createOrderRefundInWp,
  listOrderRefunds,
  listOrderWpNotes,
  updateOrderStatusInWp,
} from "./orders.wp.service";

/**
 * Controllers for the Phase 27 order write-back endpoints. Route middleware
 * already enforces the base permission; the refund controller additionally
 * checks orders.refund_payment when the BODY requests real money movement —
 * a body-dependent check middleware cannot express.
 */

/** PUT /orders/:id/status — change the order status in WooCommerce. */
export async function updateOrderStatusHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { id } = req.params as OrderParams;
  const { status } = req.body as UpdateOrderStatusInput;

  const result = await updateOrderStatusInWp(storeId, id, status, userId);

  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.ORDER_STATUS_CHANGED,
    entityType: AUDIT_ENTITY_TYPES.ORDER,
    entityId: result.order.id,
    message: `غيّر حالة الطلب ${result.order.orderNumber ?? result.order.wpOrderId ?? ""} من ${result.previousStatus} إلى ${result.order.status}`,
    metadata: {
      wpOrderId: result.order.wpOrderId,
      from: result.previousStatus,
      to: result.order.status,
    },
  });

  res
    .status(200)
    .json(successResponse(toOrderDto(result.order), "Order status updated"));
}

/** GET /orders/:id/wp-notes — the order's WooCommerce notes (live read). */
export async function listOrderWpNotesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as OrderParams;
  const notes = await listOrderWpNotes(storeId, id);
  res.status(200).json(successResponse({ items: notes }, ""));
}

/** POST /orders/:id/wp-notes — add a WooCommerce order note. */
export async function addOrderWpNoteHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { id } = req.params as OrderParams;
  const input = req.body as AddOrderWpNoteInput;

  const note = await addOrderWpNote(storeId, id, input, userId);

  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.ORDER_NOTE_ADDED,
    entityType: AUDIT_ENTITY_TYPES.ORDER,
    entityId: id,
    message: input.customerNote
      ? "أضاف ملاحظة للعميل على الطلب في ووردبريس"
      : "أضاف ملاحظة خاصة على الطلب في ووردبريس",
    metadata: { noteId: note.noteId, customerNote: note.customerNote },
  });

  res.status(201).json(successResponse(note, "Note added"));
}

/** POST /orders/:id/refunds — create a WooCommerce refund (money-sensitive). */
export async function createOrderRefundHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { id } = req.params as OrderParams;
  const input = req.body as CreateOrderRefundInput;

  // Real money movement needs the stricter permission (plan3 §2.2). The route
  // guard memoized the user's permission keys on req.auth.
  if (input.refundPayment) {
    const keys =
      req.auth?.permissionKeys ??
      new Set(await loadPermissionKeys(userId, storeId));
    if (!keys.has("orders.refund_payment")) {
      throw new ForbiddenError(
        "Refunding money through the gateway requires the refund-payment permission.",
      );
    }
  }

  const result = await createOrderRefundInWp(storeId, id, input, userId);

  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.ORDER_REFUND_CREATED,
    entityType: AUDIT_ENTITY_TYPES.ORDER,
    entityId: result.order.id,
    message: `أنشأ استرداداً بقيمة ${result.refund.amount} ${result.refund.currency} للطلب ${result.order.orderNumber ?? result.order.wpOrderId ?? ""}${input.refundPayment ? " (مع إعادة المبلغ عبر بوابة الدفع)" : ""}`,
    metadata: {
      wpOrderId: result.order.wpOrderId,
      wpRefundId: result.refund.wpRefundId,
      amount: result.refund.amount,
      currency: result.refund.currency,
      refundedPayment: result.refund.refundedPayment,
    },
  });

  res.status(201).json(
    successResponse(
      {
        refund: toOrderRefundDto(result.refund),
        order: toOrderDto(result.order),
      },
      "Refund created",
    ),
  );
}

/** GET /orders/:id/refunds — the order's refund mirror rows. */
export async function listOrderRefundsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as OrderParams;
  const refunds = await listOrderRefunds(storeId, id);
  res
    .status(200)
    .json(successResponse({ items: refunds.map(toOrderRefundDto) }, ""));
}
