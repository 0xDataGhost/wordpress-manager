import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { getAuth } from "../../middleware/authenticate";
import { recordAuditFromRequest } from "../audit-logs/audit-logs.recorder";
import {
  assignCodesForOrder,
  buildAssignmentAuditEntry,
} from "./digital-delivery.engine";
import {
  getOrderAssignments,
  listQueue,
} from "./digital-delivery.service";
import { toAssignmentDto } from "./digital-delivery.serializer";
import type {
  AssignOrderInput,
  OrderParams,
  QueueQuery,
} from "./digital-delivery.schemas";

/**
 * POST /digital-delivery/orders/:orderId/assign — run the assignment engine for
 * an order (digital_delivery.assign). Manual staff trigger: assigns all eligible
 * digital products regardless of order status (respectReserveStatus=false).
 */
export async function assignHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { orderId } = req.params as OrderParams;
  const body = req.body as AssignOrderInput;

  const result = await assignCodesForOrder(storeId, orderId, {
    allowPartial: body.allowPartial,
    actorUserId: userId,
    respectReserveStatus: false,
    reason: body.reason ?? null,
  });

  // Audit (ids/counts only — never raw codes).
  const entry = buildAssignmentAuditEntry(result);
  if (entry) {
    await recordAuditFromRequest(req, {
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      message: entry.message,
      metadata: entry.metadata,
    });
  }

  res.status(200).json(
    successResponse(
      {
        orderId: result.orderId,
        status: result.status,
        requiredCodes: result.requiredCodes,
        assignedCodes: result.assignedCodes,
        items: result.items,
      },
      "Assignment complete",
    ),
  );
}

/**
 * GET /digital-delivery/orders/:orderId/assignments — masked assignments + the
 * order's digital fulfillment summary (digital_delivery.view).
 */
export async function getAssignmentsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { orderId } = req.params as OrderParams;
  const view = await getOrderAssignments(storeId, orderId);

  res.status(200).json(
    successResponse({
      orderId: view.orderId,
      orderNumber: view.orderNumber,
      orderStatus: view.orderStatus,
      digitalDeliveryStatus: view.digitalDeliveryStatus,
      requiredCodes: view.requiredCodes,
      assignedCodes: view.assignedCodes,
      assignments: view.assignments.map(toAssignmentDto),
    }),
  );
}

/** GET /digital-delivery/queue — orders needing digital attention (digital_delivery.view). */
export async function queueHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const query = req.query as unknown as QueueQuery;
  const result = await listQueue(storeId, query);

  res.status(200).json(
    successResponse({
      items: result.items,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
      },
    }),
  );
}
