# plan3.md — Full WooCommerce Remote Control Expansion

> Continues `plan.md` (Phases 0–14) and `plan2.md` (Phases 15–24).
> Goal: the SaaS dashboard becomes the **primary operating surface** for a WooCommerce
> store (like the fares store), so a merchant almost never needs wp-admin for daily
> e-commerce work.
> Status: **DRAFT — awaiting audit/approval before implementation.**

---

# 0. Executive Summary

## 0.1 Where we are today

The system already mirrors the store (products, orders, customers via sync + webhooks)
and fully owns digital fulfillment. But the **write surface into WordPress is tiny**:

| Direction | Today |
|---|---|
| SaaS → WP writes | Create product, update product, add digital-note to order. Nothing else. |
| WP → SaaS events | `product.updated`, `product.stock`, `order.created`, `order.updated` only. |
| Everything else | Coupons, refunds (money), order status, categories, media, customers, reviews, shipping, taxes, gateways, settings → **wp-admin only**. |

## 0.2 What this plan delivers

Eight phases (25–32) that extend the existing connector + API + dashboard pattern
until the dashboard controls the full WooCommerce e-commerce surface:

| Phase | Capability added |
|---|---|
| 25 | Write-back foundation: command outbox, idempotency, echo suppression, conflict detection, connector capability handshake |
| 26 | Full catalog control: variations, categories/tags/attributes, media upload, bulk ops, trash/delete |
| 27 | Order management: status transitions, order notes, **refunds including gateway money refunds** |
| 28 | Coupons & discounts: full CRUD + usage stats |
| 29 | Customers write-back + product reviews moderation |
| 30 | Store configuration: Woo general settings, shipping zones/methods, tax rates, payment gateway toggles |
| 31 | Real-time parity: expanded webhook topics + scheduled reconciliation (drift detection) |
| 32 | QA, security audit, docs, release |

## 0.3 What this plan explicitly does NOT deliver (see §12)

WP core administration (plugins, themes, WP users, pages/posts content), payment
gateway **secret credentials**, subscriptions, multisite. These stay in wp-admin
by design.

---

# 1. Architecture Decision — how the SaaS talks to WooCommerce

This is the most important decision to audit. Three options were considered:

| Option | Description | Verdict |
|---|---|---|
| A. WooCommerce REST v3 keys | SaaS stores a Woo consumer key/secret per store and calls `wc/v3` directly | ❌ Rejected. Second credential system next to the connector key; key has blanket read/write on everything (no per-capability scoping); bypasses our audit/echo/idempotency layer; on the fares store `wc/v3` is currency-pinned and filtered by `fares-store`. |
| B. Generic admin proxy | One connector endpoint that forwards arbitrary requests into WP | ❌ Rejected — **red line**. Turns the connector key into full remote admin; RBAC and audit logs become opaque ("proxy called" tells us nothing); impossible to reason about tenant safety. |
| C. **Explicit typed endpoints per domain (chosen)** | Extend `saas/v1` with normalized, HMAC-signed, capability-scoped endpoints, exactly like `/products` today | ✅ Matches existing architecture, plugin stays thin, every mutation is a named/auditable/permission-gated action. |

Implementation note for Option C: connector handlers may **internally** delegate to
WooCommerce CRUD objects (`WC_Product_*`, `WC_Order`, `WC_Coupon`,
`WC_Order_Refund`, `WC_Shipping_Zone`, `WC_Tax`) or reuse `WC_REST_*` controller
logic where convenient — but the public surface is always our normalized envelope,
our HMAC signature, and our per-endpoint authorization. No passthrough.

---

# 2. Critical Development Rules

All rules from `plan.md` §Development Rules and `plan2.md` §1 still apply
(thin plugin, tenant scoping by `store_id`, Arabic RTL first, API envelope shape,
RBAC style, audit-log approach, notification seam). Additional rules for this plan:

## 2.1 Write-back rules (all phases)

- **Every SaaS → WP mutation goes through the command outbox** (Phase 25). No module
  may call the connector HTTP client directly for writes.
- Every command carries an **idempotency key**; the connector must treat a replayed
  key as a no-op returning the original result.
- Every command result (success or failure) is **audit-logged** with entity ids and
  status — never full payload dumps of sensitive data.
- Mutations are **compare-and-set** where the entity supports it: the SaaS sends the
  `date_modified` (or version) it last saw; if WP's copy is newer, the connector
  returns `409 conflict` and the dashboard prompts a refresh. Money-sensitive
  operations (refunds, order status) MUST be compare-and-set; catalog edits SHOULD be.
- **Echo suppression is mandatory**: a webhook fired because of our own command must
  not be processed as an external change (see Phase 25 design).
- WP being unreachable must never lose a command: retry with backoff via the existing
  BullMQ workers, surface persistent failure as a notification.

## 2.2 Money rules (Phase 27)

- A refund that moves real money (`refund_payment: true`) is a distinct permission
  (`orders.refund_payment`) from recording a refund (`orders.refund`).
- Refund amount is validated server-side (SaaS **and** connector) against the
  remaining refundable amount. Never trust the dashboard number alone.
- Refund commands are idempotent end-to-end: the connector stores the idempotency
  key in order meta before calling the gateway, so a retry can never double-refund.
- Currency: all order amounts flowing through the connector are in the store's
  **base currency** (SAR on the fares store — its multi-currency module already pins
  admin/REST to base). Refund payloads state amount + currency explicitly; connector
  rejects a currency mismatch.

## 2.3 Settings rules (Phase 30)

- Payment gateways: the SaaS may read gateway **titles, descriptions,
  enabled/disabled state** and toggle enable/disable. It must **never read, store,
  or transmit gateway secret fields** (API keys, merchant secrets, webhook secrets).
  The connector strips secret-typed fields from every settings response.
- Settings writes are field-allowlisted per settings group. Unknown fields are
  rejected, not forwarded.

## 2.4 Connector versioning

- The connector reports `pluginVersion` + a **capability list** in the health/handshake
  response (Phase 25). The SaaS gates each dashboard feature on the store's connector
  capabilities, so an outdated plugin degrades gracefully (feature hidden with an
  "update the connector plugin" notice) instead of erroring.

---

# 3. New Permissions

Follow the existing RBAC style (resource.action, seeded into roles).

| Permission | Meaning | Owner | Manager | Order Emp. | Support | Viewer |
|---|---|---|---|---|---|---|
| `catalog.manage_taxonomies` | CRUD categories/tags/attributes | ✅ | ✅ | ❌ | ❌ | ❌ |
| `products.delete` | Trash/delete products in WP | ✅ | ✅ | ❌ | ❌ | ❌ |
| `products.manage_media` | Upload/attach product images | ✅ | ✅ | ❌ | ❌ | ❌ |
| `orders.manage_status` | Change order status in WP | ✅ | ✅ | ✅ | ❌ | ❌ |
| `orders.add_notes` | Add order notes (private/customer) | ✅ | ✅ | ✅ | ✅ | ❌ |
| `orders.refund` | Record a refund (no money movement) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `orders.refund_payment` | Refund money via gateway | ✅ | ❌ (configurable) | ❌ | ❌ | ❌ |
| `coupons.view` | View coupons | ✅ | ✅ | ✅ | ✅ | ✅ |
| `coupons.manage` | Create/edit/delete coupons | ✅ | ✅ | ❌ | ❌ | ❌ |
| `customers.manage` | Edit customer billing/shipping/notes in WP | ✅ | ✅ | ❌ | ✅ | ❌ |
| `reviews.view` | View product reviews | ✅ | ✅ | ✅ | ✅ | ✅ |
| `reviews.moderate` | Approve/reply/spam/trash reviews | ✅ | ✅ | ❌ | ✅ | ❌ |
| `store_settings.view` | View Woo settings/shipping/tax/gateways | ✅ | ✅ | ❌ | ❌ | ❌ |
| `store_settings.manage` | Edit Woo general settings | ✅ | ❌ | ❌ | ❌ | ❌ |
| `shipping.manage` | CRUD shipping zones/methods | ✅ | ✅ | ❌ | ❌ | ❌ |
| `taxes.manage` | CRUD tax rates | ✅ | ❌ | ❌ | ❌ | ❌ |
| `gateways.toggle` | Enable/disable payment gateways | ✅ | ❌ | ❌ | ❌ | ❌ |

(Exact role defaults to be confirmed during Phase 25 — table above is the proposal.)

---

# 4. Database Design (SaaS / PostgreSQL)

All tables tenant-scoped by `store_id`, following existing conventions
(uuid PK, `created_at`/`updated_at`, FK to `stores`).

## 4.1 `wp_commands` — the command outbox (Phase 25, core of everything)

```txt
id                uuid PK
store_id          uuid FK -> stores
idempotency_key   text UNIQUE (store_id, idempotency_key)
domain            text        -- 'product' | 'order' | 'coupon' | 'customer' | 'review' | 'settings' | 'shipping' | 'tax' | 'media' | 'taxonomy'
action            text        -- 'update_status' | 'create_refund' | 'create' | 'update' | 'delete' | ...
target_wp_id      bigint NULL -- WP entity id when known
payload           jsonb       -- request body sent to the connector (secrets never stored here)
expected_version  text NULL   -- date_modified / version for compare-and-set
status            text        -- 'pending' | 'sending' | 'succeeded' | 'conflict' | 'failed' | 'dead'
attempts          int
last_error        text NULL   -- sanitized message, never raw payloads
result            jsonb NULL  -- normalized connector response
created_by        uuid NULL FK -> users (NULL = automation/system)
created_at / updated_at / completed_at
```

Indexes: `(store_id, status)`, `(store_id, domain, target_wp_id)`, unique
`(store_id, idempotency_key)`.

## 4.2 Mirror tables (follow the existing products/orders/customers mirror style)

- `coupons` — WP coupon mirror: `wp_id`, code, type, amount, usage counts, limits,
  expiry, restrictions (jsonb), `date_modified_wp`.
- `order_refunds` — refunds per order: `wp_refund_id`, amount, currency, reason,
  `refunded_payment` bool, line items (jsonb), initiated_by (SaaS user or `wp-admin`).
- `product_categories`, `product_tags`, `product_attributes` — id, name, slug,
  parent, counts. (If Phase 5/6 already stores these as jsonb on products, promote
  to real mirror tables here — needed for CRUD UIs.)
- `product_reviews` — `wp_review_id`, product ref, author, rating, content excerpt,
  status (approved/hold/spam/trash), `date_modified_wp`.
- `store_settings_snapshot` — one row per (store, settings_group): jsonb of the
  allowlisted fields + fetched_at. Read model only; source of truth stays WP.
- `shipping_zones` / `shipping_methods` — mirror of zones, locations, methods and
  their non-secret settings.
- `tax_rates` — mirror of Woo tax rates.

## 4.3 Not stored

- Gateway secret fields — never fetched, never stored (see §2.3).
- Full customer payment tokens — never fetched.

---

# 5. Connector (WordPress plugin) — new REST surface

All endpoints: existing HMAC signature auth (`class-saas-connector-signature.php`),
normalized envelope (`class-saas-connector-normalize.php` grows per domain),
idempotency-key handling, and per-endpoint capability checks. Namespace stays
`saas/v1`. New files follow the existing `class-saas-connector-*.php` layout —
one thin class per domain, registered from `class-saas-connector-rest.php`.

## 5.1 Endpoint map (summary — details in each phase)

```txt
Catalog (Phase 26)
  POST   /products/{id}/variations            create variation
  PUT    /products/{id}/variations/{vid}      update variation
  DELETE /products/{id}/variations/{vid}
  DELETE /products/{id}                       trash (default) or force
  POST   /products/bulk                       bulk price/stock/status (bounded batch)
  GET/POST/PUT/DELETE /taxonomies/{taxonomy}  categories | tags | attributes (+terms)
  POST   /media                               sideload by URL or accept upload; returns attachment id
Orders (Phase 27)
  PUT    /orders/{id}/status                  compare-and-set status transition
  POST   /orders/{id}/notes                   private or customer note
  GET    /orders/{id}/notes
  POST   /orders/{id}/refunds                 create refund; optional refund_payment
  GET    /orders/{id}/refunds
Coupons (Phase 28)
  GET/POST       /coupons
  GET/PUT/DELETE /coupons/{id}
Customers & Reviews (Phase 29)
  PUT    /customers/{id}                      billing/shipping/name allowlist
  POST   /customers/{id}/notes
  GET    /reviews                             paged, status filter
  PUT    /reviews/{id}                        moderate: approve|hold|spam|trash
  POST   /reviews/{id}/reply
Settings (Phase 30)
  GET    /settings/{group}                    general|products|tax|shipping (allowlisted, secrets stripped)
  PUT    /settings/{group}                    allowlisted fields only
  GET    /shipping/zones                      zones + locations + methods
  POST/PUT/DELETE /shipping/zones(...)        zone & method CRUD
  GET/POST/PUT/DELETE /taxes/rates
  GET    /gateways                            id, title, enabled — secrets stripped
  PUT    /gateways/{id}                       enabled + safe display fields only
Sync additions (Phase 31)
  GET    /sync/coupons | /sync/reviews | /sync/refunds | /sync/taxonomies
  GET    /capabilities                        connector version + supported endpoint list
```

## 5.2 New webhook topics (Phase 31)

```txt
product.deleted, product.restored
order.note_added (customer notes only — for timeline freshness)
order.refunded            (fires for wp-admin refunds too → keeps mirror honest)
coupon.created/updated/deleted
customer.created/updated
review.created/updated
settings.updated          (group name only, SaaS re-pulls the group)
```

Every webhook payload gains two fields: `origin_command_id` (set when the change
was caused by a SaaS command — see Phase 25 echo suppression) and
`entity_version` (`date_modified` where available).

---

# 6. API Response Rules

Unchanged from plan.md/plan2.md: existing envelope `{ success, data, message }`,
pagination meta, tenant scoping from JWT or connector key, no secrets in any DTO.
New rule: command-producing endpoints return `202` with the command row
(`{ commandId, status }`) when executed asynchronously, or `200` with the final
result when the connector round-trip completes inline (target p95 < 2s; fall back
to async on timeout).

---

# 7. Frontend Navigation Additions

Follow existing dashboard conventions (RTL-first, pages/ + components/ pairs,
permission-gated nav items, light/dark).

```txt
الكوبونات (Coupons)                → /coupons, /coupons/new, /coupons/:id
التقييمات (Reviews)                → /reviews (moderation queue)
تصنيفات المتجر (Catalog)           → /catalog (categories/tags/attributes tabs)
إعدادات المتجر (Store Settings)    → /store-settings (general, shipping, tax, gateways tabs)
أوامر المزامنة (Command Center)    → /wp-commands (outbox status, retries, conflicts)
```

Plus in-place expansions: order page gains status control + notes timeline +
refund dialog; product page gains variations editor, media manager, taxonomy
pickers, delete; customer page gains edit form.

---

# 8. Implementation Phases

---

# Phase 25 — Write-Back Foundation ⏳ PENDING

## Goal
Build the plumbing every later phase depends on: command outbox, idempotency,
echo suppression, conflict detection, connector capability handshake. **No new
merchant-visible features** except the Command Center page.

## Backend
- `wp_commands` table + repository + service (`enqueueCommand`, `executeCommand`,
  `retryCommand`) with BullMQ worker for async execution and backoff
  (existing workers app).
- Refactor the two existing write paths (product create/update, digital-note) to go
  through the outbox — proves the pattern with zero new surface.
- Command API: `GET /wp-commands` (list, filters), `POST /wp-commands/:id/retry`
  (permission-gated), stats endpoint for the Command Center.
- Audit-log every command lifecycle transition.

## Connector
- Idempotency store: `saas_command_{key}` in a dedicated table or options row with
  TTL; replayed keys return the stored result with `replayed: true`.
- Echo suppression: every mutating request carries `X-Saas-Command-Id`; the
  connector remembers it (short-lived, e.g. transient keyed by entity) and stamps
  outgoing webhooks for that entity with `origin_command_id`.
- SaaS webhook handler: if `origin_command_id` matches a command we issued →
  mark the command `succeeded`/confirmed and **skip** normal external-change
  processing.
- Compare-and-set helper: shared code that validates `expected_version` against
  the entity's `date_modified` and returns a structured `409`.
- `GET /capabilities` endpoint + SaaS-side `connector_capabilities` on the store
  record; dashboard feature gates read from it.

## Frontend
- Command Center page (`/wp-commands`): status table, filter by domain/status,
  retry button, conflict badge, dead-letter view.

## Acceptance criteria
- Product update from dashboard → command row `succeeded`, webhook echo suppressed
  (no duplicate sync processing), audit entries present.
- Same command re-sent with the same idempotency key → single WP change.
- Editing a product in wp-admin, then saving a stale dashboard form → `conflict`
  status → dashboard shows "refresh" prompt, no overwrite.
- WP offline → command retries, notification raised after N failures, retry from
  Command Center succeeds once WP is back.
- Old connector (v0.1) + new SaaS → features gated off cleanly, no errors.

---

# Phase 26 — Full Catalog Control ⏳ PENDING

## Goal
Everything about the catalog manageable from the dashboard: variable products,
taxonomies, media, bulk operations, deletion.

## Scope
- **Variations**: create/update/delete variations (price, stock, image, attributes)
  through connector endpoints wrapping `WC_Product_Variation`. Dashboard product
  page gets a variations editor (matrix-style for small attribute sets).
- **Taxonomies**: categories (hierarchical), tags, attributes + terms — full CRUD,
  mirror tables, pickers on the product form, dedicated Catalog page.
- **Media**: `POST /media` accepts `{ source_url }` (sideload — same mechanism the
  importer uses) or multipart upload relayed by the SaaS; product form gets
  featured-image + gallery management.
- **Bulk ops**: `POST /products/bulk` — bounded batch (≤50/request) of
  price/stock/status changes; one outbox command per batch, per-item results.
- **Delete**: trash by default, `force=true` behind a confirm dialog +
  `products.delete`.

## Acceptance criteria
- The variable product from the fares catalogue (`قراند - سوني 4`) can be rebuilt
  as variable **from the dashboard** and renders correctly on the storefront.
- Category created in dashboard appears in WP and vice-versa (webhook/sync).
- Image uploaded from dashboard becomes featured image on the live product page.
- Bulk price change of 30 products lands as one command with 30/30 item results.
- All mutations audited, permission-gated, echo-suppressed.

---

# Phase 27 — Order Management Write-Back ⏳ PENDING

## Goal
Run the whole order lifecycle from the dashboard, including money refunds.

## Scope
- **Status transitions**: `PUT /orders/{id}/status` with compare-and-set;
  connector uses `WC_Order::update_status` so all Woo side-effects (emails, stock,
  digital delivery hooks, fares-store auto-complete) fire normally. Dashboard order
  page gets a status control with allowed-transitions map.
- **Order notes**: list/add private + customer notes; timeline on the order page
  (merges Woo notes with existing SaaS digital events).
- **Refunds**:
  - `POST /orders/{id}/refunds` → `wc_create_refund` with line items or amount,
    `refund_payment` flag for gateway money refund (only when the gateway supports
    it — connector reports `can_refund_payment` per order).
  - Full/partial; server-side remaining-amount validation on both sides (§2.2);
    idempotency key persisted in order meta **before** the gateway call.
  - `order.refunded` webhook keeps the mirror + digital-code release logic in sync
    (reuses the existing Phase 19/20.5 refund handling for codes — no duplication).
- Guardrail: status → `refunded`/`cancelled` from the dashboard prompts the digital
  release flow exactly as a webhook-driven change would (single code path).

## Acceptance criteria
- Complete flow on a real order: processing → completed from dashboard; Woo email
  sent; digital delivery unaffected.
- Partial refund with `refund_payment=false` and full refund with
  `refund_payment=true` (test gateway) both idempotent under command retry —
  provably no double refund.
- Refund attempted by a role holding `orders.refund` but not
  `orders.refund_payment` with `refund_payment=true` → 403.
- wp-admin refund → webhook → mirror + code release still correct (parity).
- Stale status transition (order changed in wp-admin meanwhile) → 409, UI refresh.

---

# Phase 28 — Coupons & Discounts ⏳ PENDING

## Goal
Full coupon lifecycle from the dashboard.

## Scope
- Connector CRUD wrapping `WC_Coupon`; `coupon.*` webhooks; `/sync/coupons` pull;
  `coupons` mirror table.
- SaaS module `modules/coupons` (controller/service/schemas/serializer + tests, same
  file shape as `orders`).
- Dashboard: coupons list (search, status, expiry), create/edit form covering the
  full Woo model (type, amount, expiry, usage limits, per-user limits, product /
  category / email restrictions, free shipping flag), usage stats from mirrored
  orders.
- Automations seam: coupon creation available as an automation action
  (e.g. winback), reusing the existing automations engine.

## Acceptance criteria
- Coupon created in dashboard is immediately usable at checkout on the storefront.
- Coupon created in wp-admin appears in dashboard within one webhook cycle.
- Usage counts match Woo after several checkout uses.
- Delete requires `coupons.manage` and is audited.

---

# Phase 29 — Customers Write-Back & Reviews Moderation ⏳ PENDING

## Goal
Support-team daily work without wp-admin.

## Scope
- **Customers**: `PUT /customers/{id}` allowlist (first/last name, billing,
  shipping, phone); customer notes; NO password/email-login changes, NO role
  changes (red line — those are WP user administration).
- **Reviews**: mirror + moderation queue (approve/hold/spam/trash), reply as store;
  `review.*` webhooks; rating summary on the product page in the dashboard.

## Acceptance criteria
- Editing a customer's billing phone in dashboard reflects in wp-admin and in the
  next order prefill.
- Review approved in dashboard appears on the storefront product page.
- Support role can moderate reviews but cannot touch settings/coupons.
- All writes audited with entity ids only (no PII in log metadata).

---

# Phase 30 — Store Configuration Control ⏳ PENDING

## Goal
The wp-admin-only tail: Woo settings, shipping, taxes, gateway toggles — with the
strictest guardrails in the plan (§2.3).

## Scope
- **Settings groups** (general, products, tax display, checkout basics): read via
  `GET /settings/{group}` (allowlisted fields, secrets stripped), write via
  field-allowlisted `PUT`. Snapshot table + settings tabs UI with a "last pulled
  from WP" indicator.
- **Shipping**: zones + locations + methods (flat rate, free shipping, local pickup)
  CRUD; method settings are per-method allowlists.
- **Taxes**: standard/reduced/zero rate tables CRUD.
- **Gateways**: list with enabled state + safe display fields; toggle enable/disable
  (`gateways.toggle`, Owner-only by default). Secret fields never leave WP.
- Every settings write raises a store notification ("checkout settings changed by X")
  — these changes affect money flow and must be visible.

## Acceptance criteria
- Store address / currency-decimals change from dashboard reflects on storefront.
- New flat-rate method created from dashboard charges correctly at checkout.
- Gateway response provably contains no secret-typed fields (test asserts on a
  gateway configured with dummy secrets).
- Non-Owner attempting gateway toggle → 403 + audit entry.
- CURRENCY GOTCHA (fares store): base currency edits must respect the
  `pre_option_woocommerce_currency` filter issue documented in the theme project —
  the connector must write the option with the filter removed or via direct option
  update, and the plan treats base-currency change as Owner-only + double-confirm.

---

# Phase 31 — Real-Time Parity & Reconciliation ⏳ PENDING

## Goal
Trust: the dashboard mirror is provably fresh and self-healing.

## Scope
- Ship all §5.2 webhook topics in the connector; SaaS handlers per topic
  (idempotent via the existing event-dedup mechanism).
- **Reconciliation worker**: scheduled (per store, e.g. hourly incremental /
  nightly full) comparison of WP vs mirror using `date_modified` + counts per
  domain; drift found → targeted re-pull + `sync_drift` notification with counts.
- Connection page gains a **parity panel**: per-domain last-webhook time, last
  reconcile time, drift counter, manual "reconcile now".
- Backfill `/sync/*` pulls for all new domains (coupons, reviews, refunds,
  taxonomies) into the existing manual-sync flow.

## Acceptance criteria
- Any wp-admin change in any supported domain appears in the dashboard within one
  webhook delivery (or next reconcile if webhook lost).
- Killing webhooks for an hour then reconciling restores exact parity —
  demonstrated in a test scenario.
- Reconcile is tenant-scoped, bounded (paged), and cannot starve the queue.

---

# Phase 32 — QA, Security Audit & Release ⏳ PENDING

## Goal
Same bar as Phases 14 and 24 before this goes near a real store.

## Scope
- Full-suite verification: API typecheck/tests/lint, dashboard build/lint,
  connector PHPCS; extend the unit suite for every new module (target: keep the
  existing all-green standard, coverage on money paths is mandatory).
- **Security audit scenarios** (5-validator style used in the digital audit):
  1. Refund idempotency under concurrent retries (no double money movement).
  2. RBAC matrix sweep across every new endpoint (esp. `refund_payment`,
     `gateways.toggle`, `taxes.manage`).
  3. Tenant isolation sweep on all new tables/queries.
  4. Secret-leak sweep: gateway settings, logs, audit metadata, DTOs.
  5. Echo/conflict correctness: no lost updates, no self-webhook loops.
- E2E happy paths against a live wp-env store (the fares stack is the reference
  environment): product+variation+image, order status+refund, coupon checkout,
  review moderation, shipping method checkout.
- Docs: connector README v2, capability matrix, merchant-facing "what needs
  wp-admin" list, rollback/uninstall notes.
- Release: version-bumped connector zip, migration order, staged rollout checklist.

## Acceptance criteria
- 15+ scenario audit report with PASS on all, defects fixed or documented exactly
  like `digital-integration-report.md`.
- A merchant demo script: one week of store operations performed **only** in the
  dashboard.

---

# 9. Build Order & Parallelization

Strict sequence: **25 → 27 → 26 → 28 → 29 → 30 → 31 → 32**.

Rationale: 25 is the foundation (nothing ships without the outbox); 27 (orders)
before 26 (catalog) because order control is the highest daily-value gap and
exercises the money guardrails early while the surface is small. 28/29 are
independent of each other and may run as parallel sessions after 27 (both touch
disjoint modules); 30 must wait for the settings allowlist infrastructure review;
31 needs all domains to exist; 32 is last.

Per-phase parallel-session guidance follows the plan2 §10 pattern:
connector (PHP) work, API module work, and dashboard work are separable within
each phase after the schema/contract is fixed on day one of the phase.

---

# 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Webhook echo loops (SaaS write → WP hook → webhook → SaaS reprocess) | Phase 25 echo suppression is a hard prerequisite; tested explicitly. |
| Double refunds on retry | Idempotency key persisted in WP order meta **before** gateway call; connector-side dedup; audit both sides. |
| Overwriting wp-admin edits (two admin surfaces) | Compare-and-set + 409 UX; reconciliation catches anything missed. |
| Connector/SaaS version skew across tenants | Capability handshake + feature gating (Phase 25). |
| Gateway secret exposure | Never fetched (allowlist strip at the connector, the only component that can read them); leak-sweep test in Phase 32. |
| Plugin bloat (violating "thin plugin" rule) | Connector stays CRUD-wrapper + normalize + auth only; all decisions/business rules remain SaaS-side; PHP review gate per phase. |
| fares-store currency filter interference | Documented gotcha handled in Phase 30; base-currency flows always in SAR per §2.2. |

---

# 11. Absolute Red Lines (additions to plan2 §14)

- Never build a generic WP proxy/passthrough endpoint.
- Never store or transmit payment-gateway secret fields through the SaaS.
- Never move money without `orders.refund_payment` + idempotency key + server-side
  amount validation.
- Never bypass the command outbox for a SaaS → WP mutation.
- Never process a webhook echo of our own command as an external change.
- Never let the connector make business decisions (it executes commands and
  reports events; the SaaS decides).
- Never change WP user roles/passwords/emails from the SaaS.

---

# 12. Explicitly Deferred (not in this plan)

- WP core administration: plugin/theme install & updates, WP users, menus,
  pages/posts content editing.
- Payment gateway credential management.
- WooCommerce Subscriptions / Bookings / Memberships.
- Storefront theme controls (the fares theme stays git/wp-admin managed).
- fares-store multi-currency admin (FX overrides UI) — candidate for a later
  store-specific extension phase once Phase 30's settings pattern exists.
- Multisite / multiple WP stores per tenant beyond the current model.

---

# 13. Success Definition

A merchant on a connected WooCommerce store (the fares store as reference) can run
**all daily e-commerce operations from the dashboard only** — catalog (incl.
variations, images, categories), orders (status, notes, refunds with money),
coupons, customer edits, review moderation, shipping/tax/gateway-toggle
configuration — with:

- every mutation permission-gated, audited, idempotent, and echo-safe;
- provable mirror parity (reconciliation green);
- zero regressions in the digital fulfillment system (293+ tests stay green);
- wp-admin needed only for the §12 deferred list.
