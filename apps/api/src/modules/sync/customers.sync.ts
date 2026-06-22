import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { customers } from "../../db/schema/customers";
import { upsertMapping } from "./external-mappings.service";
import type { WooCustomer } from "./sync.schemas";

export interface UpsertResult {
  total: number;
  created: number;
  updated: number;
}

/**
 * Upserts WooCommerce customers into a store, keyed by wp_customer_id, and
 * refreshes each external mapping. Idempotent: re-syncing the same customers
 * updates the existing rows instead of duplicating them. Runs in one transaction
 * so a batch is all-or-nothing.
 */
export async function upsertCustomersFromWoo(
  storeId: string,
  incoming: WooCustomer[],
): Promise<UpsertResult> {
  const now = new Date();
  let created = 0;
  let updated = 0;

  await db.transaction(async (tx) => {
    for (const item of incoming) {
      const fields = {
        name: item.name,
        email: item.email ?? null,
        phone: item.phone ?? null,
        totalSpent: item.totalSpent,
        ordersCount: item.ordersCount,
        lastOrderAt: item.lastOrderAt ?? null,
        lastSyncedAt: now,
      };

      const [existing] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.storeId, storeId),
            eq(customers.wpCustomerId, item.wpCustomerId),
          ),
        )
        .limit(1);

      let id: string;
      if (existing) {
        await tx
          .update(customers)
          .set({ ...fields, updatedAt: now })
          .where(eq(customers.id, existing.id));
        id = existing.id;
        updated += 1;
      } else {
        const [inserted] = await tx
          .insert(customers)
          .values({ storeId, wpCustomerId: item.wpCustomerId, ...fields })
          .returning({ id: customers.id });
        if (!inserted) {
          throw new Error("Failed to insert synced customer");
        }
        id = inserted.id;
        created += 1;
      }

      await upsertMapping(
        tx,
        {
          storeId,
          entityType: "customer",
          source: "woocommerce",
          externalId: String(item.wpCustomerId),
        },
        id,
      );
    }
  });

  return { total: incoming.length, created, updated };
}
