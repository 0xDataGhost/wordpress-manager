import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { customers, type CustomerRow } from "../../db/schema/customers";
import { NotFoundError, ServiceUnavailableError, ValidationError } from "../../lib/errors";
import { runWpCommandOrThrow } from "../wp-commands/wp-commands.service";
import type { UpdateCustomerWpInput } from "./customers.schemas";

/**
 * Customer write-back to WooCommerce (Phase 29). Field-allowlisted edits of
 * name/phone/billing/shipping through the command outbox; refreshes the mirror
 * from the connector response. Never touches email-login/password/role.
 */

async function requireLinkedCustomer(
  storeId: string,
  customerId: string,
): Promise<CustomerRow & { wpCustomerId: number }> {
  const [row] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.storeId, storeId), eq(customers.id, customerId)))
    .limit(1);
  if (!row) {
    throw new NotFoundError("Customer not found");
  }
  if (!row.wpCustomerId) {
    throw new ValidationError(
      "This customer is a guest or has not been synced from WooCommerce, so it cannot be edited there.",
    );
  }
  return row as CustomerRow & { wpCustomerId: number };
}

interface CustomerResult {
  wpCustomerId: number;
  name: string;
  phone: string | null;
  billing: Record<string, unknown> | null;
  shipping: Record<string, unknown> | null;
  dateModified: string | null;
}

function parseCustomerResult(data: unknown): CustomerResult | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const wpCustomerId = Number(d.wpCustomerId);
  if (!Number.isInteger(wpCustomerId) || wpCustomerId <= 0) return null;
  return {
    wpCustomerId,
    name: typeof d.name === "string" ? d.name : "",
    phone: typeof d.phone === "string" ? d.phone : null,
    billing:
      d.billing && typeof d.billing === "object"
        ? (d.billing as Record<string, unknown>)
        : null,
    shipping:
      d.shipping && typeof d.shipping === "object"
        ? (d.shipping as Record<string, unknown>)
        : null,
    dateModified: typeof d.dateModified === "string" ? d.dateModified : null,
  };
}

export async function updateCustomerInWp(
  storeId: string,
  customerId: string,
  input: UpdateCustomerWpInput,
  userId: string,
): Promise<CustomerRow> {
  const customer = await requireLinkedCustomer(storeId, customerId);

  const command = await runWpCommandOrThrow({
    storeId,
    domain: "customer",
    action: "update",
    targetWpId: customer.wpCustomerId,
    payload: {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      billing: input.billing,
      shipping: input.shipping,
    },
    expectedVersion: customer.wpVersion,
    createdBy: userId,
  });

  const result = parseCustomerResult(command.result);
  if (!result) {
    throw new ServiceUnavailableError(
      "WooCommerce confirmed the update but returned an unexpected response.",
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(customers)
    .set({
      name: result.name || customer.name,
      phone: result.phone ?? customer.phone,
      billing: result.billing ?? customer.billing,
      shipping: result.shipping ?? customer.shipping,
      wpVersion: result.dateModified ?? customer.wpVersion,
      lastSyncedAt: now,
      updatedAt: now,
    })
    .where(and(eq(customers.storeId, storeId), eq(customers.id, customerId)))
    .returning();
  if (!updated) {
    throw new NotFoundError("Customer not found");
  }
  return updated;
}
