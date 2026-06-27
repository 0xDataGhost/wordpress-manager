import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { codeAssignments } from "../../db/schema/code-assignments";
import {
  customerAccessTokens,
  type CustomerAccessTokenRow,
} from "../../db/schema/customer-access-tokens";
import { customerCodeViews } from "../../db/schema/customer-code-views";
import { digitalCodes } from "../../db/schema/digital-codes";
import { digitalProductSettings } from "../../db/schema/digital-product-settings";
import { orders } from "../../db/schema/orders";
import { products } from "../../db/schema/products";
import { stores } from "../../db/schema/stores";
import { NotFoundError, ServiceUnavailableError } from "../../lib/errors";
import {
  decryptDigitalCode,
  isDigitalCodeCryptoConfigured,
} from "../../lib/digital-code-crypto";
import {
  hashAccessToken,
  isCustomerTokenConfigured,
} from "../../lib/customer-token";
import { isTokenAccessible } from "./customer-access.policy";
import {
  toPublicOrderView,
  type PublicCodeRow,
  type PublicOrderView,
} from "./customer-access.serializer";

/**
 * Public customer self-service portal (Phase 22). NO JWT — access is gated solely
 * by a valid signed token carried in the request body. Every query is scoped to
 * the token's `store_id` + `order_id` (resolved from the stored row), so a token
 * can NEVER reach another order or store. The full code is decrypted and returned
 * only by `revealCustomerCode` with `action: "viewed"`; every access is recorded.
 */

export interface PublicRequestContext {
  ip: string | null;
  userAgent: string | null;
}

/** Single generic rejection for every failure (never leaks the reason). */
const GENERIC_MESSAGE = "هذا الرابط غير صالح أو منتهي الصلاحية.";
function rejectGeneric(): never {
  throw new NotFoundError(GENERIC_MESSAGE);
}

function assertConfigured(): void {
  if (!isCustomerTokenConfigured() || !isDigitalCodeCryptoConfigured()) {
    throw new ServiceUnavailableError("Customer self-service is not configured.");
  }
}

/** Resolves a raw token to its (unscoped) row via the keyed HMAC fingerprint. */
async function findTokenRow(
  token: string,
): Promise<CustomerAccessTokenRow | null> {
  const tokenHash = hashAccessToken(token);
  const [row] = await db
    .select()
    .from(customerAccessTokens)
    .where(eq(customerAccessTokens.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

/** Loads the masked, delivered-only codes for the token's order. */
async function loadDeliveredRows(
  storeId: string,
  orderId: string,
): Promise<PublicCodeRow[]> {
  return db
    .select({
      codeId: codeAssignments.codeId,
      codePreview: digitalCodes.codePreview,
      productId: codeAssignments.productId,
      productName: products.name,
      instructions: digitalProductSettings.instructionsTemplate,
    })
    .from(codeAssignments)
    .innerJoin(digitalCodes, eq(digitalCodes.id, codeAssignments.codeId))
    .leftJoin(products, eq(products.id, codeAssignments.productId))
    .leftJoin(
      digitalProductSettings,
      and(
        eq(digitalProductSettings.storeId, codeAssignments.storeId),
        eq(digitalProductSettings.productId, codeAssignments.productId),
      ),
    )
    .where(
      and(
        eq(codeAssignments.storeId, storeId),
        eq(codeAssignments.orderId, orderId),
        eq(codeAssignments.status, "delivered"),
      ),
    )
    .orderBy(asc(products.name), asc(digitalCodes.createdAt), asc(digitalCodes.id));
}

/** POST /public/digital-orders/lookup — order metadata + masked previews only. */
export async function lookupOrder(token: string): Promise<PublicOrderView> {
  assertConfigured();
  const tokenRow = await findTokenRow(token);
  if (!tokenRow || !isTokenAccessible(tokenRow)) {
    rejectGeneric();
  }

  const [order] = await db
    .select({ orderNumber: orders.orderNumber, storeName: stores.name })
    .from(orders)
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .where(
      and(eq(orders.storeId, tokenRow.storeId), eq(orders.id, tokenRow.orderId)),
    )
    .limit(1);
  if (!order) {
    rejectGeneric();
  }

  const rows = await loadDeliveredRows(tokenRow.storeId, tokenRow.orderId);
  return toPublicOrderView(order.orderNumber, order.storeName, rows);
}

export interface RevealResult {
  codeId: string;
  /** Present only for the `viewed` action; omitted for `copied`. */
  code?: string;
}

/**
 * POST /public/digital-orders/reveal — reveals ONE delivered code (`viewed`) or
 * records that a revealed code was copied (`copied`). For `viewed`, the use is
 * consumed atomically (race-safe) BEFORE returning the plaintext; the access is
 * always recorded in `customer_code_views`. The raw code is never logged.
 */
export async function revealCustomerCode(
  token: string,
  codeId: string,
  action: "viewed" | "copied",
  ctx: PublicRequestContext,
): Promise<RevealResult> {
  assertConfigured();
  const tokenRow = await findTokenRow(token);
  if (!tokenRow || !isTokenAccessible(tokenRow)) {
    rejectGeneric();
  }

  // The code must be a DELIVERED code of THIS token's order + store.
  const [assignment] = await db
    .select({
      assignmentId: codeAssignments.id,
      customerId: codeAssignments.customerId,
      cipher: digitalCodes.codeCipher,
      iv: digitalCodes.codeIv,
      tag: digitalCodes.codeTag,
    })
    .from(codeAssignments)
    .innerJoin(digitalCodes, eq(digitalCodes.id, codeAssignments.codeId))
    .where(
      and(
        eq(codeAssignments.storeId, tokenRow.storeId),
        eq(codeAssignments.orderId, tokenRow.orderId),
        eq(codeAssignments.codeId, codeId),
        eq(codeAssignments.status, "delivered"),
      ),
    )
    .limit(1);
  if (!assignment) {
    rejectGeneric();
  }

  if (action === "copied") {
    await db.insert(customerCodeViews).values({
      storeId: tokenRow.storeId,
      codeId,
      assignmentId: assignment.assignmentId,
      orderId: tokenRow.orderId,
      customerId: assignment.customerId,
      tokenId: tokenRow.id,
      viewerType: "customer",
      action: "copied",
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { codeId };
  }

  // action === "viewed": decrypt first (so a corrupt code never consumes a use),
  // then consume one use atomically and record the view in a single transaction.
  const code = decryptDigitalCode({
    cipher: assignment.cipher,
    iv: assignment.iv,
    tag: assignment.tag,
  });

  const now = new Date();
  await db.transaction(async (tx) => {
    const used = await tx
      .update(customerAccessTokens)
      .set({
        usedCount: sql`${customerAccessTokens.usedCount} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(customerAccessTokens.id, tokenRow.id),
          eq(customerAccessTokens.storeId, tokenRow.storeId),
          isNull(customerAccessTokens.revokedAt),
          gt(customerAccessTokens.expiresAt, now),
          sql`(${customerAccessTokens.maxUses} is null or ${customerAccessTokens.usedCount} < ${customerAccessTokens.maxUses})`,
        ),
      )
      .returning({ id: customerAccessTokens.id });
    if (used.length === 0) {
      // Exhausted / expired / revoked between checks — uniform rejection.
      rejectGeneric();
    }

    await tx.insert(customerCodeViews).values({
      storeId: tokenRow.storeId,
      codeId,
      assignmentId: assignment.assignmentId,
      orderId: tokenRow.orderId,
      customerId: assignment.customerId,
      tokenId: tokenRow.id,
      viewerType: "customer",
      action: "viewed",
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });
  });

  return { codeId, code };
}
