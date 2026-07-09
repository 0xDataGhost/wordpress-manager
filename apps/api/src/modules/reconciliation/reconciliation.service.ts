import { count, eq } from "drizzle-orm";
import { db } from "../../db";
import { products } from "../../db/schema/products";
import { orders } from "../../db/schema/orders";
import { customers } from "../../db/schema/customers";
import { coupons } from "../../db/schema/coupons";
import { productReviews } from "../../db/schema/product-reviews";
import { getConnectionByStoreId } from "../connections/connections.service";
import { wpRequest } from "../connections/wp-client";
import { createNotification } from "../notifications/notifications.service";
import { logger } from "../../lib/logger";
import { ServiceUnavailableError } from "../../lib/errors";
import type { StoreConnectionRow } from "../../db/schema/store-connections";

/**
 * Reconciliation (Phase 31, plan3): compare the SaaS mirror against WooCommerce
 * per domain and surface drift. Bounded and tenant-scoped. This is the
 * self-healing backstop for any webhook that was lost — it re-pulls the domains
 * that drifted and raises a notification with the counts.
 *
 * Runs on demand (Connection page "reconcile now") and can be scheduled by the
 * workers app against this same service. Comparison is by COUNT per domain
 * (cheap, catches lost create/delete deliveries); a full row-level diff is a
 * future hardening pass.
 */

export type ReconcileDomain =
  | "product"
  | "order"
  | "customer"
  | "coupon"
  | "review";

export interface DomainParity {
  domain: ReconcileDomain;
  localCount: number;
  remoteCount: number | null;
  drift: number | null;
  ok: boolean;
  error?: string;
}

export interface ReconcileResult {
  storeId: string;
  domains: DomainParity[];
  driftedDomains: ReconcileDomain[];
  checkedAt: Date;
}

async function requireConnection(storeId: string): Promise<StoreConnectionRow> {
  const connection = await getConnectionByStoreId(storeId);
  if (!connection || connection.status !== "connected" || !connection.siteUrl) {
    throw new ServiceUnavailableError(
      "Store is not connected to WordPress. Connect the store first.",
    );
  }
  return connection;
}

/** Counts local mirror rows for a domain (excludes soft-archived where apt). */
async function localCount(
  storeId: string,
  domain: ReconcileDomain,
): Promise<number> {
  const table = {
    product: products,
    order: orders,
    customer: customers,
    coupon: coupons,
    review: productReviews,
  }[domain];
  const [row] = await db
    .select({ value: count() })
    .from(table)
    .where(eq(table.storeId, storeId));
  return Number(row?.value ?? 0);
}

/** Reads the remote count for a domain from the connector's count endpoint. */
async function remoteCount(
  connection: StoreConnectionRow,
  domain: ReconcileDomain,
): Promise<number | null> {
  const result = await wpRequest(connection, "GET", `counts/${domain}`);
  if (!result.ok) return null;
  const data = result.data as { count?: unknown } | null;
  const value = Number(data?.count);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

const ALL_DOMAINS: ReconcileDomain[] = [
  "product",
  "order",
  "customer",
  "coupon",
  "review",
];

/**
 * Reconciles a store: compares counts per domain and notifies on drift. Never
 * throws per-domain — a domain the connector can't count reports ok:false with
 * its error and does not fail the whole reconcile.
 */
export async function reconcileStore(
  storeId: string,
  checkedAt: Date = new Date(),
): Promise<ReconcileResult> {
  const connection = await requireConnection(storeId);

  const domains: DomainParity[] = [];
  for (const domain of ALL_DOMAINS) {
    try {
      const [local, remote] = await Promise.all([
        localCount(storeId, domain),
        remoteCount(connection, domain),
      ]);
      const drift = remote === null ? null : remote - local;
      domains.push({
        domain,
        localCount: local,
        remoteCount: remote,
        drift,
        ok: remote !== null && drift === 0,
        error: remote === null ? "Remote count unavailable" : undefined,
      });
    } catch (err) {
      domains.push({
        domain,
        localCount: 0,
        remoteCount: null,
        drift: null,
        ok: false,
        error: err instanceof Error ? err.message : "Reconcile failed",
      });
    }
  }

  const driftedDomains = domains
    .filter((d) => d.drift !== null && d.drift !== 0)
    .map((d) => d.domain);

  if (driftedDomains.length > 0) {
    try {
      await createNotification({
        storeId,
        type: "sync_drift",
        title: "انحراف في المزامنة",
        message: `تم اكتشاف اختلاف بين لوحة التحكم وووردبريس في: ${driftedDomains.join(", ")}. يمكن إعادة المزامنة لتصحيحه.`,
        severity: "warning",
        metadata: {
          driftedDomains,
          counts: domains.map((d) => ({
            domain: d.domain,
            local: d.localCount,
            remote: d.remoteCount,
            drift: d.drift,
          })),
        },
      });
    } catch (err) {
      logger.error({ err, storeId }, "Failed to raise sync_drift notification");
    }
  }

  return { storeId, domains, driftedDomains, checkedAt };
}
