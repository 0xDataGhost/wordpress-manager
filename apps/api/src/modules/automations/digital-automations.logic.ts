/**
 * Pure, dependency-free decision logic for the Phase 23 digital automations.
 * Kept separate from the DB layer so every rule is unit-testable in isolation —
 * mirroring `digital-reports.math.ts`, `transitions.ts`, and the engine's
 * `deriveOrderDigitalStatus`. The run helpers in `automations.service.ts` call
 * these so the tricky decisions are covered without a database.
 *
 * SECURITY: nothing here ever touches a raw code, cipher, or customer token —
 * it operates only on counts, statuses, thresholds, and ids.
 */

/** A digital product's available-pool snapshot for the stock alerts. */
export interface ProductStockRow {
  productId: string;
  productName: string | null;
  available: number;
  /** The product's own configured low-stock threshold. */
  threshold: number;
}

export type ThresholdMode = "product_setting" | "global";

/**
 * The threshold to compare a product's available pool against. In `global` mode
 * every product uses `globalThreshold` (falling back to the product's own when
 * a global value is not provided); otherwise each product uses its own setting.
 */
export function resolveLowStockThreshold(
  mode: ThresholdMode,
  globalThreshold: number | undefined,
  productThreshold: number,
): number {
  if (mode === "global" && typeof globalThreshold === "number") {
    return globalThreshold;
  }
  return productThreshold;
}

/**
 * Low stock = the available pool is at/under the threshold but NOT empty. Empty
 * pools are reported by the dedicated out-of-stock alert, so the two automations
 * never double-notify for the same product.
 */
export function isLowStock(available: number, threshold: number): boolean {
  return available > 0 && available <= threshold;
}

/** Out of stock = no available codes remain. */
export function isOutOfStock(available: number): boolean {
  return available <= 0;
}

export interface LowStockHit {
  productId: string;
  productName: string | null;
  available: number;
  threshold: number;
}

/** Products that are low (but not empty) under the configured threshold mode. */
export function selectLowStockProducts(
  rows: ProductStockRow[],
  mode: ThresholdMode,
  globalThreshold: number | undefined,
): LowStockHit[] {
  return rows
    .map((r) => ({
      productId: r.productId,
      productName: r.productName,
      available: r.available,
      threshold: resolveLowStockThreshold(mode, globalThreshold, r.threshold),
    }))
    .filter((r) => isLowStock(r.available, r.threshold))
    .sort((a, b) => a.available - b.available);
}

/** Products whose available pool is empty. */
export function selectOutOfStockProducts(
  rows: ProductStockRow[],
): Array<{ productId: string; productName: string | null }> {
  return rows
    .filter((r) => isOutOfStock(r.available))
    .map((r) => ({ productId: r.productId, productName: r.productName }));
}

/** Replacement rate = replacements / total assignments, rounded to 4 dp; 0 when no data. */
export function computeReplacementRate(
  total: number,
  replacements: number,
): number {
  if (total <= 0) return 0;
  return Math.round((replacements / total) * 10000) / 10000;
}

/** True when the replacement rate strictly exceeds the configured ceiling. */
export function isReplacementBreach(
  total: number,
  replacements: number,
  maxRate: number,
): boolean {
  if (total <= 0) return false;
  return computeReplacementRate(total, replacements) > maxRate;
}

/** Whether an order's current status is one the automation acts on. */
export function isOrderStatusEligible(
  orderStatus: string,
  configStatuses: string[],
): boolean {
  return configStatuses.includes(orderStatus);
}

/** A customer self-service link as seen by the auto-deliver dedup check. */
export interface CustomerLinkLike {
  revokedAt: Date | string | null;
  expiresAt: Date | string;
}

/**
 * True when the order already has an active (not revoked, not expired) customer
 * link — used so the auto-deliver automation never creates a duplicate link.
 */
export function hasActiveCustomerLink(
  links: CustomerLinkLike[],
  now: Date,
): boolean {
  const nowMs = now.getTime();
  return links.some(
    (l) =>
      l.revokedAt === null && new Date(l.expiresAt).getTime() > nowMs,
  );
}
