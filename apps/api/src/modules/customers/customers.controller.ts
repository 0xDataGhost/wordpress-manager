import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { NotFoundError } from "../../lib/errors";
import { getAuth } from "../../middleware/authenticate";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import { recordAuditFromRequest } from "../audit-logs/audit-logs.recorder";
import { toCustomerDetailsDto, toCustomerDto } from "./customers.serializer";
import {
  getCustomerDetails,
  listCustomers,
  updateCustomerNotes,
} from "./customers.service";
import { updateCustomerInWp } from "./customers.wp.service";
import type {
  CustomerParams,
  ListCustomersQuery,
  UpdateCustomerNotesInput,
  UpdateCustomerWpInput,
} from "./customers.schemas";

/** GET /customers — list the current store's customers (customers.view). */
export async function listCustomersHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const query = req.query as unknown as ListCustomersQuery;
  const result = await listCustomers(storeId, query);

  res.status(200).json(
    successResponse(
      {
        items: result.items.map(toCustomerDto),
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

/** GET /customers/:id — fetch one customer with metrics + recent orders (customers.view). */
export async function getCustomerHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as CustomerParams;
  const details = await getCustomerDetails(storeId, id);
  if (!details) {
    throw new NotFoundError("Customer not found");
  }
  res
    .status(200)
    .json(
      successResponse(
        toCustomerDetailsDto(
          details.customer,
          details.metrics,
          details.recentOrders,
        ),
        "",
      ),
    );
}

/** PATCH /customers/:id/notes — update internal notes (customers.edit). */
export async function updateCustomerNotesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as CustomerParams;
  const input = req.body as UpdateCustomerNotesInput;
  const details = await updateCustomerNotes(storeId, id, input);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.CUSTOMER_NOTES_UPDATED,
    entityType: AUDIT_ENTITY_TYPES.CUSTOMER,
    entityId: details.customer.id,
    message: `حدّث ملاحظات العميل`,
    // Record only whether notes are now present — never the note content.
    metadata: { hasNotes: details.customer.internalNotes !== null },
  });
  res
    .status(200)
    .json(
      successResponse(
        toCustomerDetailsDto(
          details.customer,
          details.metrics,
          details.recentOrders,
        ),
        "Customer notes updated",
      ),
    );
}

/** PUT /customers/:id — write name/phone/billing/shipping to WooCommerce. */
export async function updateCustomerWpHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { id } = req.params as CustomerParams;
  const input = req.body as UpdateCustomerWpInput;
  const customer = await updateCustomerInWp(storeId, id, input, userId);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.CUSTOMER_UPDATED_WP,
    entityType: AUDIT_ENTITY_TYPES.CUSTOMER,
    entityId: customer.id,
    // Record only which fields changed — never the address/PII values.
    message: "حدّث بيانات العميل في ووردبريس",
    metadata: { wpCustomerId: customer.wpCustomerId, changed: Object.keys(input) },
  });
  res.status(200).json(successResponse(toCustomerDto(customer), "Customer updated"));
}
