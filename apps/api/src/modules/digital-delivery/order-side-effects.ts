import { maybeAssignCodesForOrder } from "./digital-delivery.service";
import { maybeDeliverCodesForOrder } from "./delivery.service";
import { maybeReleaseCodesForOrder } from "./manual.service";

/**
 * The digital-fulfillment side effects of an order reaching a (possibly new)
 * status. ONE code path shared by both triggers (plan3 Phase 27 guardrail):
 *  - the webhook handler, after upserting an order changed in WooCommerce;
 *  - the orders module, after a successful SaaS status/refund command (whose
 *    webhook echo is suppressed and therefore will NOT re-run these).
 *
 * Ordering matters and matches the original webhook block: release first so a
 * terminal (cancelled/refunded) order never also assigns/delivers — assignment
 * and delivery are status-gated and no-op on terminal orders anyway. Every
 * step is best-effort and idempotent; this function never throws.
 */
export async function applyOrderDigitalSideEffects(
  storeId: string,
  orderId: string,
  status: string,
): Promise<void> {
  await maybeReleaseCodesForOrder(storeId, orderId, status);
  await maybeAssignCodesForOrder(storeId, orderId);
  await maybeDeliverCodesForOrder(storeId, orderId);
}
