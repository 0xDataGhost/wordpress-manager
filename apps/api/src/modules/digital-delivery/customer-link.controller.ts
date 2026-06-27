import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { env } from "../../config/env";
import { getAuth } from "../../middleware/authenticate";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import { recordAuditFromRequest } from "../audit-logs/audit-logs.recorder";
import {
  createCustomerLink,
  listCustomerLinks,
  revokeCustomerLink,
} from "./customer-link.service";
import { toCustomerLinkDto } from "./customer-link.serializer";
import type {
  CreateCustomerLinkInput,
  CustomerLinkParams,
} from "./customer-link.schemas";
import type { OrderParams } from "./digital-delivery.schemas";

/** Builds the public link URL when a base URL is configured, else null. */
function buildLinkUrl(token: string): string | null {
  return env.PUBLIC_APP_URL
    ? `${env.PUBLIC_APP_URL.replace(/\/$/, "")}/digital-order/${token}`
    : null;
}

/** POST /digital-delivery/orders/:orderId/customer-link (digital_delivery.customer_link). */
export async function createCustomerLinkHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { orderId } = req.params as OrderParams;
  const body = req.body as CreateCustomerLinkInput;

  const result = await createCustomerLink(storeId, orderId, body, userId);

  // Audit: ids + lifecycle metadata only — NEVER the token.
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.DIGITAL_CUSTOMER_LINK_CREATED,
    entityType: AUDIT_ENTITY_TYPES.DIGITAL_DELIVERY,
    entityId: orderId,
    message: "أنشأ رابط وصول للعميل",
    metadata: {
      orderId,
      tokenId: result.id,
      expiresAt: result.expiresAt.toISOString(),
      maxUses: result.maxUses,
    },
  });

  res.status(201).json(
    successResponse(
      {
        id: result.id,
        token: result.token,
        url: buildLinkUrl(result.token),
        expiresAt: result.expiresAt,
        maxUses: result.maxUses,
      },
      "Customer link created",
    ),
  );
}

/** GET /digital-delivery/orders/:orderId/customer-links (digital_delivery.view). */
export async function listCustomerLinksHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { orderId } = req.params as OrderParams;
  const rows = await listCustomerLinks(storeId, orderId);
  res.status(200).json(
    successResponse({ items: rows.map((row) => toCustomerLinkDto(row)) }),
  );
}

/** POST /digital-delivery/customer-links/:id/revoke (digital_delivery.customer_link). */
export async function revokeCustomerLinkHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as CustomerLinkParams;
  const result = await revokeCustomerLink(storeId, id);

  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.DIGITAL_CUSTOMER_LINK_REVOKED,
    entityType: AUDIT_ENTITY_TYPES.DIGITAL_DELIVERY,
    entityId: result.orderId,
    message: "ألغى رابط وصول للعميل",
    metadata: { orderId: result.orderId, tokenId: result.id },
  });

  res.status(200).json(successResponse({ id: result.id }, "Customer link revoked"));
}
