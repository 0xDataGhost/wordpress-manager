import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { NotFoundError } from "../../lib/errors";
import { getAuth } from "../../middleware/authenticate";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import { recordAuditFromRequest } from "../audit-logs/audit-logs.recorder";
import {
  toOrderDetailsDto,
  toOrderDto,
} from "./orders.serializer";
import {
  getOrderDetails,
  listOrders,
  updateOrderNotes,
} from "./orders.service";
import type {
  ListOrdersQuery,
  OrderParams,
  UpdateOrderNotesInput,
} from "./orders.schemas";

/** GET /orders — list the current store's orders (orders.view). */
export async function listOrdersHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const query = req.query as unknown as ListOrdersQuery;
  const result = await listOrders(storeId, query);

  res.status(200).json(
    successResponse(
      {
        items: result.items.map((r) => toOrderDto(r.order, r.customer)),
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
        },
      },
      "",
    ),
  );
}

/** GET /orders/:id — fetch one order with items + customer (orders.view). */
export async function getOrderHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as OrderParams;
  const details = await getOrderDetails(storeId, id);
  if (!details) {
    throw new NotFoundError("Order not found");
  }
  res
    .status(200)
    .json(
      successResponse(
        toOrderDetailsDto(details.order, details.customer, details.items),
        "",
      ),
    );
}

/** PATCH /orders/:id/notes — update internal notes (orders.edit). */
export async function updateOrderNotesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as OrderParams;
  const input = req.body as UpdateOrderNotesInput;
  const details = await updateOrderNotes(storeId, id, input);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.ORDER_NOTES_UPDATED,
    entityType: AUDIT_ENTITY_TYPES.ORDER,
    entityId: details.order.id,
    message: `حدّث ملاحظات الطلب`,
    // Record only whether notes are now present — never the note content.
    metadata: {
      orderNumber: details.order.orderNumber,
      hasNotes: details.order.internalNotes !== null,
    },
  });
  res
    .status(200)
    .json(
      successResponse(
        toOrderDetailsDto(details.order, details.customer, details.items),
        "Order notes updated",
      ),
    );
}
