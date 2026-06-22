import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { orders } from "../../db/schema/orders";
import { orderItems } from "../../db/schema/order-items";
import { findLocalId, upsertMapping } from "./external-mappings.service";
import type { UpsertResult } from "./customers.sync";
import type { WooOrder } from "./sync.schemas";

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
    }
  });

  return { total: incoming.length, created, updated };
}
