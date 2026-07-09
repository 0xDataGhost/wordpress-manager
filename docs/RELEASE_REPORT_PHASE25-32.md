# Release Report — WooCommerce Write-Back System (plan3, Phases 25–32)

**Version:** connector `1.0.0`, api `1.0.0`, dashboard `1.0.0`
**Scope:** continues plan.md (0–14) and plan2.md (15–24); implements plan3.md (25–32).
**Outcome:** the SaaS dashboard becomes the primary operating surface for a connected
WooCommerce store — catalog, orders (incl. money refunds), coupons, customers, review
moderation, and store configuration — all through an idempotent, echo-safe, tenant-scoped
command outbox.

---

## Phases delivered

| Phase | Delivered | Surfaces |
|---|---|---|
| **25 — Write-Back Foundation** | `wp_commands` outbox, per-store idempotency, echo suppression (`origin_command_id`), compare-and-set (409), connector capability handshake. Rerouted the two pre-existing write paths (product publish, digital-note) through the outbox. | API `wp-commands/*` · connector echo/idempotency/versioning/capabilities classes · **Command Center** page |
| **27 — Orders** | Status transitions (all Woo side effects), private/customer notes, refunds (record-only + real gateway money, own domain idempotency), refund mirror. Digital-code release runs through a shared `order-side-effects` seam for both webhook and command paths. | API `orders.wp.*` · connector `orders` class · order page: status control, notes timeline, refund dialog |
| **26 — Catalog** | Variations CRUD, taxonomies (categories/tags/attributes), media sideload, bulk ops (≤50), product delete (trash/force). | API `catalog/*` · connector `catalog` class · **Catalog** page + product-page sections |
| **28 — Coupons** | Full coupon CRUD + mirror + sync read. | API `coupons/*` · connector `coupons` class · **Coupons** page |
| **29 — Customers & Reviews** | Customer billing/shipping/name edit (allowlisted, never login/password/role); review moderation + reply. | API `customers.wp.*`, `reviews/*` · connector `people` class · **Reviews** page + customer edit dialog |
| **30 — Store Config** | Settings groups (general/products/tax, allowlisted), shipping zones/methods, tax rates, gateway enable/disable (secrets stripped). | API `store-config/*` · connector `config` class · **Store Settings** page (tabs) |
| **31 — Parity & Reconciliation** | Coupon/review webhooks + `order.refunded`; `/reconciliation/run` count-drift detection + notification; connector `counts` endpoint; parity panel. | API `reconciliation/*`, extended webhooks · connector `counts` class · **Parity panel** on Connection page |
| **32 — QA, Security Audit & Release** | Adversarial security audit (found + fixed 4 issues, below); docs; version bumps; this report. | — |

---

## Security audit — findings found and FIXED

Two adversarial `security-reviewer` passes (refund/money path; RBAC/tenant/secrets)
ran against the full diff. **No issue was left open.**

### CRITICAL — refund could move money twice on a client retry (FIXED)
`createOrderRefundInWp` called the outbox without a stable idempotency key, so a
re-submitted refund after a timeout/dropped response minted a fresh key and the
connector's dedup couldn't match it → a second gateway refund.
**Fix:** a stable client-generated `idempotencyKey` (UUID per refund dialog) is threaded
client → API → outbox → connector, where the WooCommerce refund is keyed on it **before**
any gateway call. A retry now finds the existing refund. (`orders.schemas.ts`,
`orders.wp.service.ts`, dashboard `OrderRefundsCard.tsx`, connector `orders` class.)

### CRITICAL — concurrent double-submit race could over-refund (FIXED)
The in-flight guard was a check-then-insert with no lock; two concurrent requests could
both pass and each refund up to the remaining amount.
**Fix:** a Postgres **partial unique index** `wp_commands_refund_in_flight_unique` on
`(store_id, target_wp_id) WHERE domain='order' AND action='create_refund' AND status IN
('pending','sending')` — the DB rejects a second in-flight refund per order; the loser is
translated to a `409 Conflict`. (migration `0025`, `wp-commands.ts` schema,
`orders.wp.service.ts`.)

### HIGH — gateway error messages leaked to clients / stored (FIXED)
Raw gateway `process_refund` error text flowed into `wp_commands.last_error` and the API
response.
**Fix:** the raw message is logged server-side only (`wc_get_logger`); a generic
"payment gateway declined the refund" is returned. (connector `orders` class.)

### HIGH — secret-strip second wall had gaps (FIXED)
`stripSecretsDefensively` missed username-style gateway credentials (`login`,
`api_username`), connected-account ids (`clientId`, `stripe_user_id`, `account_id`), and
`*_key_id`. The connector also carried a **dead** `$gateway_secret_denylist` array whose
docblock overstated the enforced control.
**Fix:** broadened the SaaS regex (covers key-anywhere, login/username/user_id/account_id/
client_id/bearer/auth) with a regression test; removed the dead PHP array and corrected the
docblock to state the real control (an explicit safe-field allowlist in `get_gateways()`).
(`store-config.service.ts`, connector `config` class.)

### Verified clean (no changes needed)
Tenant isolation (every query `store_id`-scoped), RBAC gating on every mutation route
(incl. the body-dependent `orders.refund_payment` escalation), settings/customer field
allowlists enforced before enqueue, and audit metadata carrying ids/counts/field-names
only. Lower-severity notes (permanent-delete tier, `last_error` echo, reconcile rate
limiting) documented for a future hardening pass; none exploitable.

---

## Verification (final)

| Check | Result |
|---|---|
| API unit tests (`tsx --test`) | ✅ **380/380 pass** (was 332 pre-plan3; +48 new) |
| API typecheck (`tsc --noEmit`) | ✅ pass |
| API lint (`eslint`) | ✅ pass |
| Dashboard build (`tsc -b && vite build`) | ✅ pass |
| Dashboard lint (`eslint`) | ✅ pass |
| Connector PHP lint (`php -l`, all classes) | ✅ pass |
| Migration journal integrity | ✅ 0019–0025 journaled, sequential |

## Migrations added

| # | Table / change |
|---|---|
| 0019 | `wp_commands` outbox + `store_connections.connector_capabilities` + `webhook_events.origin_command_id` |
| 0020 | `order_refunds` mirror + `orders.total_refunded`/`wp_version` + `products.wp_version` |
| 0021 | `product_taxonomies` mirror |
| 0022 | `coupons` mirror |
| 0023 | `product_reviews` mirror + `customers.billing`/`shipping`/`wp_version` |
| 0024 | `store_config_snapshots` |
| 0025 | `wp_commands_refund_in_flight_unique` partial index (money-safety) |

## Connector plugin (v1.0.0) — new classes

`echo`, `idempotency`, `versioning`, `capabilities`, `orders`, `catalog`, `coupons`,
`people`, `config`, `counts` — added to the loader; existing `products`, `sync`,
`delivery`, `webhooks`, `normalize`, `signature`, `api-client`, `admin` extended.

## New dashboard surfaces

`/wp-commands` (Command Center), `/catalog`, `/coupons`, `/reviews`, `/store-settings`,
plus extensions to the order, customer, product, and connection pages (parity panel).

## Docs

- `plugins/wordpress-connector/README.md` — connector README v2.
- `docs/connector-api-v2.md` — endpoint + webhook + idempotency/echo reference.
- `docs/wp-admin-remainder.md` — dashboard coverage vs. what still needs wp-admin.
- `docs/RELEASE_REPORT_PHASE25-32.md` — this report.
