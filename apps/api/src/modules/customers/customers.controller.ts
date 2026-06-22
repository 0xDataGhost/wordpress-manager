import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { NotFoundError } from "../../lib/errors";
import { getAuth } from "../../middleware/authenticate";
import { toCustomerDetailsDto, toCustomerDto } from "./customers.serializer";
import {
  getCustomerDetails,
  listCustomers,
  updateCustomerNotes,
} from "./customers.service";
import type {
  CustomerParams,
  ListCustomersQuery,
  UpdateCustomerNotesInput,
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
