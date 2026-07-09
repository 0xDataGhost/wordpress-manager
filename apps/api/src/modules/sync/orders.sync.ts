import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { orders } from "../../db/schema/orders";
import { orderItems } from "../../db/schema/order-items";
import { orderRefunds } from "../../db/schema/order-refunds";
import { findLocalId, upsertMapping } from "./external-mappings.service";
import type { UpsertResult } from "./customers.sync";
import type { WooOrder, WooRefund } from "./sync.schemas";
import type { DbTransaction } from "../../db";

/**
 * Upserts WooCommerce orders into a store, keyed by wp_order_id, refreshing the
 * external mapping and replacing the order's line items on each sync. The buyer
 * and each line's product are linked to local rows via external_mappings when
 * those have already been synced; otherwise the link is left null but the
 * WooCommerce ids are preserved. Idempotent and transactional per batch.
 */
export async function upsertOrdersFromWoo(
  storeId: string,
  incoming: WooOrder[],
): Promise<UpsertResult> {
  const now = new Date();
  let created = 0;
  let updated = 0;

  await db.transaction(async (tx) => {
    for (const item of incoming) {
      // Resolve the local customer row, if the buyer has been synced.
      const customerLocalId = item.wpCustomerId
        ? await findLocalId(tx, {
            storeId,
            entityType: "customer",
            source: "woocommerce",
            externalId: String(item.wpCustomerId),
          })
        : null;

      const fields = {
        customerId: customerLocalId,
        orderNumber: item.orderNumber ?? null,
        status: item.status,
        total: item.total,
        currency: item.currency,
        paymentMethod: item.paymentMethod ?? null,
        totalRefunded: item.totalRefunded,
        // Older connectors omit the version token; keep the last-known one.
        ...(item.dateModified ? { wpVersion: item.dateModified } : {}),
        placedAt: item.placedAt ?? null,
        lastSyncedAt: now,
      };

      const [existing] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            eq(orders.wpOrderId, item.wpOrderId),
          ),
        )
        .limit(1);

      let orderId: string;
      if (existing) {
        await tx
          .update(orders)
          .set({ ...fields, updatedAt: now })
          .where(eq(orders.id, existing.id));
        orderId = existing.id;
        updated += 1;
      } else {
        const [inserted] = await tx
          .insert(orders)
          .values({ storeId, wpOrderId: item.wpOrderId, ...fields })
          .returning({ id: orders.id });
        if (!inserted) {
          throw new Error("Failed to insert synced order");
        }
        orderId = inserted.id;
        created += 1;
      }

      await upsertMapping(
        tx,
        {
          storeId,
          entityType: "order",
          source: "woocommerce",
          externalId: String(item.wpOrderId),
        },
        orderId,
      );

      // Line items are derived data: replace them wholesale so re-syncs do not
      // accumulate stale lines.
      await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));

      for (const line of item.lineItems) {
        const productLocalId = line.wpProductId
          ? await findLocalId(tx, {
              storeId,
              entityType: "product",
              source: "woocommerce",
              externalId: String(line.wpProductId),
            })
          : null;

        await tx.insert(orderItems).values({
          storeId,
          orderId,
          productId: productLocalId,
          wpProductId: line.wpProductId,
          name: line.name,
          sku: line.sku ?? null,
          quantity: line.quantity,
          price: line.price,
          total: line.total,
        });
      }

      await upsertOrderRefunds(
        tx,
        storeId,
        orderId,
        item.currency,
        item.refunds,
        now,
      );
    }
  });

  return { total: incoming.length, created, updated };
}

/**
 * Upserts the refund mirror keyed by (store_id, wp_refund_id). Amount/reason
 * refresh on every sync; `initiated_by` and `created_by` are set on INSERT only
 * so a SaaS-initiated refund keeps its provenance when the webhook echo of the
 * same refund arrives later (plan3 §4.2).
 */
export async function upsertOrderRefunds(
  tx: DbTransaction,
  storeId: string,
  orderId: string,
  currency: string,
  refunds: WooRefund[],
  now: Date = new Date(),
): Promise<void> {
  for (const refund of refunds) {
    const [existing] = await tx
      .select({ id: orderRefunds.id })
      .from(orderRefunds)
      .where(
        and(
          eq(orderRefunds.storeId, storeId),
          eq(orderRefunds.wpRefundId, refund.wpRefundId),
        ),
      )
      .limit(1);

    if (existing) {
      await tx
        .update(orderRefunds)
        .set({
          amount: refund.amount,
          reason: refund.reason ?? null,
          refundedPayment: refund.refundedPayment,
          wpDateCreated: refund.dateCreated ?? null,
          updatedAt: now,
        })
        .where(eq(orderRefunds.id, existing.id));
    } else {
      await tx.insert(orderRefunds).values({
        storeId,
        orderId,
        wpRefundId: refund.wpRefundId,
        amount: refund.amount,
        currency,
        reason: refund.reason ?? null,
        refundedPayment: refund.refundedPayment,
        initiatedBy: "woocommerce",
        wpDateCreated: refund.dateCreated ?? null,
      });
    }
  }
}
