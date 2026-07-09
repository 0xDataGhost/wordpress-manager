# SaaS Connector API Reference — v1.0.0 (write-back surface)

The connector exposes a signed REST surface under `wp-json/saas/v1`. Every request
(inbound from the SaaS, and every webhook the connector sends) is authenticated with
an **HMAC-SHA256** signature over `"{timestamp}.{body}"` using the connector API key,
inside a 300-second timestamp window. Envelope for all responses:
`{ success: boolean, data: <payload>, message: string }`.

> This complements `connector-api.md` (the Phase-4 SaaS-side `/api/v1/wp/*` connection
> lifecycle). This file documents the connector's own `saas/v1` write-back surface added
> across plan3 Phases 25–31.

## Request headers (SaaS → connector)

| Header | Purpose |
|---|---|
| `X-Saas-Timestamp` | Unix seconds; rejected if skew > 300s (replay defense). |
| `X-Saas-Signature` | `base64(HMAC_SHA256("{timestamp}.{body}", key))`. |
| `X-Saas-Command-Id` | Outbox command id. Round-tripped onto the webhooks the change fires (`originCommandId`) so the SaaS confirms its own command (echo suppression). |
| `X-Saas-Idempotency-Key` | Per-command key. A replay returns the stored result without re-applying. Refunds additionally key their WooCommerce refund on this **before** any gateway call. |
| `X-Saas-Expected-Version` | Compare-and-set token (the entity's `date_modified` unix ts the SaaS last saw). Mismatch → **409**. |

## Endpoints

### Foundation
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Public, non-sensitive status. |
| GET | `/capabilities` | Version + capability slugs (no WooCommerce requirement). |
| GET | `/counts/{domain}` | Reconciliation counts; `domain` ∈ product·order·customer·coupon·review. |

### Products & catalog
| Method | Path | Notes |
|---|---|---|
| POST `/products` · PUT `/products/{id}` | | Create/update (idempotent). |
| DELETE | `/products/{id}` | Body `{ force }` — trash or hard-delete. |
| POST | `/products/bulk` | ≤50 items; per-item results. |
| POST·PUT·DELETE | `/products/{id}/variations[/{variationId}]` | Variation CRUD. |
| POST | `/media` | Sideload by `sourceUrl`, optional attach + featured. |
| POST `/taxonomies/{taxonomy}` · PUT·DELETE `/{id}` | | `taxonomy` ∈ categories·tags·attributes. |

### Orders
| Method | Path | Notes |
|---|---|---|
| PUT | `/orders/{id}/status` | Compare-and-set; runs all Woo transition side effects. |
| GET·POST | `/orders/{id}/notes` | Private/customer notes. |
| GET·POST | `/orders/{id}/refunds` | Create refund; `refundPayment` moves gateway money. Amount re-validated server-side; own domain idempotency; gateway errors sanitized. |
| POST | `/orders/{id}/digital-note` | Safe "codes ready" note (no codes). |

### Coupons · Customers · Reviews
| Method | Path | Notes |
|---|---|---|
| POST·PUT·DELETE | `/coupons[/{id}]` | Full CRUD; `GET /sync/coupons` for the mirror. |
| PUT | `/customers/{id}` | Allowlisted name/phone/billing/shipping. Never login/password/role. |
| GET·PUT | `/reviews[/{id}]` | List + moderate; `POST /reviews/{id}/reply`; `GET /sync/reviews`. |

### Store configuration
| Method | Path | Notes |
|---|---|---|
| GET·PUT | `/settings/{group}` | `group` ∈ general·products·tax; **field-allowlisted** both sides. |
| GET·POST·PUT·DELETE | `/shipping/zones[/{zoneId}]` | Zones + locations. |
| POST·DELETE | `/shipping/zones/{zoneId}/methods[/{methodId}]` | Methods. |
| GET·POST·PUT·DELETE | `/taxes/rates[/{rateId}]` | Tax rate CRUD. |
| GET | `/gateways` | **Safe-field allowlist only** — id/title/description/enabled/method/supportsRefunds. No secrets. |
| PUT | `/gateways/{gatewayId}` | Accepts only `enabled`/`title`/`description`. |

### Sync reads
`GET /sync/{products,orders,customers,coupons,reviews}` — paged, normalized, for the
SaaS mirror upsert.

## Webhooks (connector → SaaS)

Topics: `product.created|updated|deleted`, `order.created|updated` (+ `order.refunded`
re-emits `order.updated`), `customer.created|updated`, `coupon.created|updated|deleted`,
`review.created|updated`. Each payload carries `event`, `eventId` (idempotency key),
`externalId`, `data` (omitted on delete), plus `entityVersion` (compare-and-set token)
and `originCommandId` (echo marker). The SaaS dedups on `(store, source, eventId)` and,
when `originCommandId` matches one of its commands, confirms that command and records
the event as `ignored` instead of re-processing it.

## Idempotency & echo suppression — behavior

- **Idempotency**: the first successful mutation stores its response keyed by a hash of
  `X-Saas-Idempotency-Key` in a durable table (7-day TTL, probabilistic GC). A replay of
  the same key returns the stored response with `replayed: true` and does **not** re-run
  the mutation. Refunds implement their own domain idempotency (the SaaS key is stamped
  onto the WooCommerce refund before the gateway call), so a retry finds the existing
  refund instead of moving money twice.
- **Echo suppression**: after the signature verifies, the connector adopts
  `X-Saas-Command-Id` for the request. Every webhook fired by hooks in that same request
  is stamped with it as `originCommandId`. The SaaS matches it to the issuing command,
  confirms the command, and skips external-change processing — no self-webhook loop.
- **Compare-and-set**: when `X-Saas-Expected-Version` is present and does not equal the
  entity's current `date_modified` timestamp, the mutation is rejected **409** so a stale
  dashboard edit never overwrites a wp-admin change.

## Secret-handling guarantees

1. Gateway credentials (API keys, secrets, merchant ids, webhook secrets, usernames)
   are **never read, stored, or transmitted**. `GET /gateways` is an explicit
   safe-field allowlist that never touches gateway settings; the SaaS applies a second
   defensive strip (`stripSecretsDefensively`) as a regression wall.
2. Refund gateway errors are logged server-side only; a generic message is returned.
3. Audit-log metadata records ids/counts/field-names only — never PII, codes, or secrets.
