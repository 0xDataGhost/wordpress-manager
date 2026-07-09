/**
 * Parity / reconciliation client.
 *
 * Compares the SaaS mirror against WooCommerce per domain and reports drift.
 * JWT-authenticated and tenant-scoped on the backend:
 *   runReconciliation → POST /reconciliation/run  (JWT, settings.view)
 *
 * The endpoint takes no body. If the store isn't connected the backend responds
 * 503 and `apiRequest` throws an `ApiError` carrying that message.
 */

import { apiRequest } from "./http";

export type ReconcileDomain =
  | "product"
  | "order"
  | "customer"
  | "coupon"
  | "review";

export interface ReconcileDomainResult {
  domain: ReconcileDomain;
  localCount: number;
  remoteCount: number | null;
  drift: number | null;
  ok: boolean;
  error?: string;
}

export interface ReconcileResult {
  storeId: string;
  domains: ReconcileDomainResult[];
  driftedDomains: string[];
  checkedAt: string;
}

/** Runs a reconciliation pass and returns per-domain counts + drift. */
export function runReconciliation(): Promise<ReconcileResult> {
  return apiRequest<ReconcileResult>("/reconciliation/run", {
    method: "POST",
  });
}
