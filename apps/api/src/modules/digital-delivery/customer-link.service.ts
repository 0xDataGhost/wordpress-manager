import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { codeAssignments } from "../../db/schema/code-assignments";
import {
  customerAccessTokens,
  type CustomerAccessTokenRow,
} from "../../db/schema/customer-access-tokens";
import { orders } from "../../db/schema/orders";
import { env } from "../../config/env";
import {
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from "../../lib/errors";
import { isDigitalCodeCryptoConfigured } from "../../lib/digital-code-crypto";
import {
  generateAccessToken,
  hashAccessToken,
  isCustomerTokenConfigured,
} from "../../lib/customer-token";
import type { CreateCustomerLinkInput } from "./customer-link.schemas";

const DAY_MS = 86_400_000;

export interface CreateCustomerLinkResult {
  id: string;
  /** The raw token — returned ONCE to the staff caller, never stored/logged. */
  token: string;
  expiresAt: Date;
  maxUses: number | null;
}

/**
 * Generates a customer self-service link for an order (Phase 22). Requires at
 * least one DELIVERED code to share. Enforces "one active token per order" by
 * revoking all currently-active tokens for the order inside the same transaction
 * before inserting the new one. Tenant-scoped throughout.
 */
export async function createCustomerLink(
  storeId: string,
  orderId: string,
  input: CreateCustomerLinkInput,
  actorUserId: string | null,
): Promise<CreateCustomerLinkResult> {
  if (!isCustomerTokenConfigured() || !isDigitalCodeCryptoConfigured()) {
    throw new ServiceUnavailableError(
      "Customer self-service is not configured.",
    );
  }

  const [order] = await db
    .select({ id: orders.id, customerId: orders.customerId })
    .from(orders)
    .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
    .limit(1);
  if (!order) throw new NotFoundError("Order not found");

  const [delivered] = await db
    .select({ id: codeAssignments.id })
    .from(codeAssignments)
    .where(
      and(
        eq(codeAssignments.storeId, storeId),
        eq(codeAssignments.orderId, orderId),
        eq(codeAssignments.status, "delivered"),
      ),
    )
    .limit(1);
  if (!delivered) {
    throw new ValidationError("Order has no delivered digital codes to share.");
  }

  const ttlDays = Math.min(
    input.expiresInDays ?? env.CUSTOMER_LINK_DEFAULT_TTL_DAYS,
    env.CUSTOMER_LINK_MAX_TTL_DAYS,
  );
  const expiresAt = new Date(Date.now() + ttlDays * DAY_MS);
  // undefined → server default; null → unlimited; number → that cap.
  const maxUses =
    input.maxUses === undefined ? env.CUSTOMER_LINK_DEFAULT_MAX_USES : input.maxUses;

  const token = generateAccessToken();
  const tokenHash = hashAccessToken(token);

  const row = await db.transaction(async (tx) => {
    // Serialize concurrent creates for the SAME order so the "one active token
    // per order" invariant holds even at READ COMMITTED (two staff generating a
    // link at once). The transaction-scoped advisory lock is released on commit.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${storeId}:${orderId}`})::bigint)`,
    );

    // One active token per order: revoke any currently-active tokens first.
    const now = new Date();
    await tx
      .update(customerAccessTokens)
      .set({ revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(customerAccessTokens.storeId, storeId),
          eq(customerAccessTokens.orderId, orderId),
          isNull(customerAccessTokens.revokedAt),
        ),
      );

    const [inserted] = await tx
      .insert(customerAccessTokens)
      .values({
        storeId,
        orderId,
        customerId: order.customerId,
        tokenHash,
        expiresAt,
        maxUses,
        createdBy: actorUserId,
      })
      .returning();
    if (!inserted) throw new Error("Failed to create customer access token");
    return inserted;
  });

  return { id: row.id, token, expiresAt: row.expiresAt, maxUses: row.maxUses };
}

/** Lists an order's links (newest first). Never returns the token/hash. */
export async function listCustomerLinks(
  storeId: string,
  orderId: string,
): Promise<CustomerAccessTokenRow[]> {
  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
    .limit(1);
  if (!order) throw new NotFoundError("Order not found");

  return db
    .select()
    .from(customerAccessTokens)
    .where(
      and(
        eq(customerAccessTokens.storeId, storeId),
        eq(customerAccessTokens.orderId, orderId),
      ),
    )
    .orderBy(desc(customerAccessTokens.createdAt), desc(customerAccessTokens.id));
}

export interface RevokeCustomerLinkResult {
  id: string;
  orderId: string;
}

/** Revokes a link (idempotent). Tenant-scoped; 404 for a cross-store id. */
export async function revokeCustomerLink(
  storeId: string,
  id: string,
): Promise<RevokeCustomerLinkResult> {
  const now = new Date();
  const [row] = await db
    .update(customerAccessTokens)
    .set({ revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(customerAccessTokens.storeId, storeId),
        eq(customerAccessTokens.id, id),
        isNull(customerAccessTokens.revokedAt),
      ),
    )
    .returning({
      id: customerAccessTokens.id,
      orderId: customerAccessTokens.orderId,
    });
  if (row) return row;

  // Either it doesn't exist (cross-store/unknown) or it's already revoked.
  const [existing] = await db
    .select({ id: customerAccessTokens.id, orderId: customerAccessTokens.orderId })
    .from(customerAccessTokens)
    .where(
      and(
        eq(customerAccessTokens.storeId, storeId),
        eq(customerAccessTokens.id, id),
      ),
    )
    .limit(1);
  if (!existing) throw new NotFoundError("Customer link not found");
  return existing;
}
