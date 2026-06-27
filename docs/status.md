# Digital Expansion — Phase Status (Audited)

> Audit date: **2026-06-27**. Method: code read across `apps/api`, `apps/dashboard`, `plugins/wordpress-connector` plus live checks.
> **Updated 2026-06-27 after Phase 20.5** (Digital Operations UI & Support Gap Closure) and **Phase 22** (Customer Self-Service Code Access) — see the dedicated sections at the bottom.
> **Updated 2026-06-28 after Phase 23** (Digital Automations Expansion) — see the dedicated section at the bottom and [digital-automations-report.md](../digital-automations-report.md).
> Verification (post-23): **API** `npm run typecheck` clean · `npm test` **332/332 passing** · `npm run lint` clean. **Dashboard** `npm run build` (incl. tsc) clean · `npm run lint` clean.
> **Updated 2026-06-28 after Phase 24** (Production Readiness, Hardening & Release Candidate) — see the dedicated section at the bottom and `production-readiness-report.md`.
> Verification (post-24): **API** `npm run typecheck` clean · `npm test` **332/332 passing** · `npm run lint` clean. **Dashboard** `npm run build` clean · `npm run lint` clean.
> Scope of this audit: Phases **15–20** (plan2.md). Phase 21 noted because code for it already exists. Phase 22 added 2026-06-27. Phase 23 added 2026-06-28.

## Summary table

| Phase | Name | Status | Backend | Frontend | Migration | Tests |
|---|---|---|---|---|---|---|
| 15 | Digital Product Foundation | ✅ COMPLETED | ✅ | ✅ (badge on details, not list) | 0012 | ✅ |
| 16 | Code Inventory & Secure Import | ✅ COMPLETED | ✅ | ✅ | 0013 | ✅ |
| 17 | Code Assignment & Reservation Engine | ✅ COMPLETED (UI added in 20.5) | ✅ | ✅ | 0014 | ✅ (unit) |
| 18 | Automatic Digital Delivery | ✅ COMPLETED (UI added in 20.5) | ✅ | ✅ | 0015 | ✅ (unit) |
| 19 | Manual Fulfillment, Resend & Replacement | ✅ COMPLETED (gaps closed in 20.5) | ✅ | ✅ | — | ✅ (unit) |
| 20 | Suppliers & Batch Cost Tracking | ✅ COMPLETED (UI added in 20.5) | ✅ | ✅ | 0016 | ✅ (unit) |
| 20.5 | Digital Operations UI & Support Gap Closure | ✅ COMPLETED | ✅ | ✅ | — | ✅ (unit) |
| 21 | Digital Reports & Profit Analytics | ✅ COMPLETED | ✅ | ✅ | — | ✅ |
| 22 | Customer Self-Service Code Access | ✅ COMPLETED | ✅ | ✅ | 0017 | ✅ (unit) |
| 23 | Digital Automations Expansion | ✅ COMPLETED | ✅ | ✅ | — | ✅ (unit) |
| 24 | Production Readiness & Release Candidate | ✅ COMPLETED | ✅ | ✅ | 0018 | ✅ (332/332) |

**Headline (original audit):** The belief that work is "complete through Phase 20" held for the **backend** but not the **frontend** — Phases 17–20 had production-grade backends but no operator UIs. **Phase 20.5 closed those gaps**: the digital-delivery queue + order section and the full suppliers UI now exist, the missing Phase 19 endpoints (assignment resend / status / mark-invalid) were added, refund/cancel webhook safe-release was wired, and the `digital_delivery` RBAC names were aligned. See the Phase 20.5 section below.

---

## Phase 15 — Digital Product Foundation — ✅ COMPLETED

- **Files:** `apps/api/src/db/schema/digital-product-settings.ts`; `apps/api/src/modules/digital-products/*` (schemas/service/serializer/controller/routes + 2 tests); `apps/dashboard/src/components/products/DigitalSettingsCard.tsx`, `digital-settings-options.ts`, `DigitalFulfillmentSummary.tsx`; `apps/dashboard/src/lib/digital-products-api.ts`.
- **Migration:** `0012_lethal_onslaught.sql` — `digital_product_settings`, unique `(store_id, product_id)` + 3 indexes. Matches spec 4.2.
- **Endpoints:** `GET /products/:id/digital-settings` (`digital_inventory.view`), `PATCH /products/:id/digital-settings` (`digital_inventory.edit`). Full Zod validation (fulfillment type, delivery mode, pool strategy, status arrays, deliver⊆reserve, max_codes bounds, unknown-key/empty-body rejection, archived-product + tenant guards).
- **Frontend:** "إعدادات المنتج الرقمي" section on product edit page; "رقمي" badge on product **details** page; edit gated by `digital_inventory.edit`.
- **Tests:** `digital-products.schemas.test.ts` (incl. audit-metadata excludes template body), `digital-products.serializer.test.ts`.
- **Risky gaps:** (MEDIUM) "رقمي" badge required on the product **list** page is only on the details page — list query never exposes a digital flag. (LOW) No service-level cross-store/archived test.

## Phase 16 — Code Inventory & Secure Import — ✅ COMPLETED

- **Files:** `apps/api/src/db/schema/{code-batches,digital-codes}.ts`; `apps/api/src/lib/digital-code-crypto.ts` (+test); `apps/api/src/modules/digital-inventory/*` (controller/routes/import/parse/schemas/serializer/service + 4 tests); `apps/api/src/middleware/rate-limit.ts`; dashboard `pages/digital-inventory/{DigitalInventoryPage,DigitalBatchesPage}.tsx` + `components/digital-inventory/*` + `lib/digital-inventory-api.ts`.
- **Migration:** `0013_demonic_wolfsbane.sql` — `code_batches`, `digital_codes` (cipher/iv/tag/hash/preview, **no raw column**), unique `(store_id, product_id, code_hash)` + all spec indexes.
- **Endpoints:** `GET /digital-inventory/summary|codes|codes/:id|batches|batches/:id` (`digital_inventory.view`); `POST /import` (`digital_inventory.import`); `POST /codes/:id/reveal` (`digital_inventory.reveal`, **rate-limited**, audited); `PATCH /codes/:id/status` (`digital_inventory.edit`, reason required for destructive transitions).
- **Security verified:** list/summary serializers are allowlists — **never return decrypted code**; `decryptDigitalCode` is called only in `revealCode`; reveal is gated + Redis rate-limited + audited (preview only); import dedups by `code_hash` both in-file and in-DB plus `onConflictDoNothing` race guard; AES-256-GCM + keyed HMAC.
- **Tests:** crypto round-trip/tamper/missing-key; parse dedup + "no raw code in candidates"; schemas; serializer asserts no cipher/hash/raw code in DTO.
- **Risky gaps:** (MEDIUM) Boot-guard is graceful-degradation (runtime `ServiceUnavailable` if keys absent) rather than a hard prod boot-refusal as the spec wording suggests. (LOW) Env vars named `DIGITAL_CODE_*` vs plan's `DIGITAL_CODES_*` (internally consistent). (LOW) `digital_inventory.export`/`.delete` permissions exist with no endpoints yet (forward-provisioned).

## Phase 17 — Code Assignment & Reservation Engine — 🟡 PARTIAL (backend complete, frontend missing)

- **Files:** `apps/api/src/db/schema/code-assignments.ts`; `apps/api/src/modules/digital-delivery/digital-delivery.{engine,service,controller,routes,schemas,serializer}.ts`; webhook seam in `apps/api/src/modules/webhooks/webhooks.service.ts`.
- **Migration:** `0014_sharp_dragon_lord.sql` — `code_assignments` (`code_id` FK `ON DELETE restrict`), **partial unique index `(store_id, code_id) WHERE status in ('assigned','delivered')`** (the double-sell guard). Added `orders.digital_delivery_status|digital_delivery_required|digital_delivery_completed_at`. `order_items` columns **not** added — counts derived live (valid alternative permitted by spec).
- **Endpoints:** `POST /digital-delivery/orders/:orderId/assign` (`digital_delivery.assign`); `GET /digital-delivery/orders/:orderId/assignments` (`.view`); `GET /digital-delivery/queue` (`.view`).
- **Concurrency verified:** selection uses raw `... FOR UPDATE SKIP LOCKED` inside `db.transaction`, guarded `WHERE status='available'` flip + partial-unique index. All 4 pool strategies correct. Re-running assignment is idempotent (counts existing active assignments, never downgrades `completed`). Webhook `processOrderEvent` calls `maybeAssignCodesForOrder` (status-gated by `reserve_on_statuses`, try/catch isolated).
- **Tests:** `digital-delivery.engine.test.ts` (status derivation + audit metadata = ids/counts only), `digital-delivery.schemas.test.ts`. No live-DB concurrency integration test.
- **Risky gaps:** (HIGH) **Entire frontend missing** — no `/digital-delivery` queue page, no order-details digital fulfillment section, no `digital-delivery-api.ts` client. The manual-review notifications fire but there is no UI to act on them.

## Phase 18 — Automatic Digital Delivery — 🟡 PARTIAL (backend ~95%, frontend missing)

- **Files:** `apps/api/src/modules/digital-delivery/{delivery.service,delivery.channels,delivery.template,delivery.controller,delivery.schemas,delivery.serializer}.ts`; schema `digital-deliveries.ts`, `delivery-attempts.ts`; connector `plugins/wordpress-connector/includes/class-saas-connector-delivery.php` (+ rest/signature).
- **Migration:** `0015_unusual_khan.sql` — `digital_deliveries` (4.8), `delivery_attempts` (4.9). `message_preview`/`error_message` documented as masked-only.
- **Endpoints present:** `POST /orders/:orderId/deliver` (`digital_delivery.deliver`); `GET /orders/:orderId/deliveries`, `GET /deliveries/:id`, `GET /deliveries` (`.view`).
- **Security verified:** delivery idempotent (no-op when all delivered) and transactional (marks assignments+codes `delivered`, order `completed`); WooCommerce note is **count-only private staff note — no raw codes** passed to the channel; connector `digital-note` route is HMAC-signed (constant-time, replay-protected). Default Arabic template; template tests assert no raw code in output/logs.
- **Tests:** `delivery.audit`, `delivery.channels`, `delivery.serializer`, `delivery.template`.
- **Risky gaps:** (MEDIUM) Spec `POST /orders/:orderId/resend` implemented as `/retry` (perm `digital_delivery.retry`). (HIGH) Entire delivery frontend missing.

## Phase 19 — Manual Fulfillment, Resend & Replacement — 🟡 PARTIAL (backend ~70%, frontend missing)

- **Files:** `apps/api/src/modules/digital-delivery/{manual.service,manual.controller,manual.schemas,transitions}.ts`.
- **Endpoints present:** `POST /orders/:orderId/manual-assign` (`.assign`); `POST /assignments/:assignmentId/replace` (`.assign`); `POST /orders/:orderId/release` (cancel/refund/manual_release, `.retry`).
- **Endpoints MISSING vs spec:** `POST /assignments/:assignmentId/resend`; `PATCH /assignments/:assignmentId/status`; `POST /digital-inventory/codes/:id/mark-invalid` (generic Phase-16 `PATCH /codes/:id/status` partly substitutes); order-level `/resend`.
- **Data integrity verified:** `transitions.ts` `decideReleaseOutcome` + `CODE_TRANSITIONS` enforce **delivered/revealed codes never return to `available`**; only undelivered reserved codes can be released. Reason enforced at Zod boundary for manual-assign/replace/release.
- **Risky gaps:** (HIGH) **No webhook handling for `order.cancelled`/`order.refunded`** — safe release is manual-endpoint-only; an upstream Woo refund does not auto-trigger release (status guard still prevents accidental re-stocking, so it is a workflow gap, not a leak). (MEDIUM) Missing audit actions `digital_code_resent`, `digital_code_marked_invalid`, `digital_assignment_refunded`, `digital_assignment_cancelled` (release records a single `digital_code_released`). (HIGH) Entire support-actions frontend missing (no reveal/resend/replace/manual-assign/mark-invalid controls, no replacement dialog on the order page).

## Phase 20 — Suppliers & Batch Cost Tracking — 🟡 PARTIAL (backend complete, frontend missing)

- **Files:** `apps/api/src/db/schema/{suppliers,supplier-products}.ts`; `apps/api/src/modules/suppliers/*` (routes/controller/service/schemas/serializer + 2 tests). Dashboard has only `lib/suppliers-api.ts` (read-only `listSuppliers` slice for the inventory filter).
- **Migration:** `0016_worthless_lockjaw.sql` — `suppliers` (+extra `is_preferred`), `supplier_products` unique `(store_id, supplier_id, product_id)`. **Adds the deferred Phase-16 FKs:** `code_batches.supplier_id` and `digital_codes.supplier_id` → `suppliers.id ON DELETE set null`.
- **Endpoints:** all 10 present — CRUD `/suppliers`, `/suppliers/:id`; products mapping `GET|POST /suppliers/:id/products`, `PATCH|DELETE /suppliers/:id/products/:mappingId`; `GET /suppliers/:id/batches`. DELETE is **soft archive** (blocks while active batches exist). Perms `digital_suppliers.view|create|edit|delete`.
- **Metrics:** total/available/sold/delivered/invalid/voided/refunded counts, batches/products counts, `estimatedCost`, `invalidRate` — store-scoped. Import flow accepts `supplierId` + `costPerCode` + `currency` (validates supplier is active + in store). Audit actions all wired.
- **Tests:** `suppliers.schemas.test.ts`, `suppliers.serializer.test.ts` (+`computeInvalidRate`).
- **Risky gaps:** (HIGH) **Entire suppliers UI missing** — no `/suppliers` list/detail pages, no nav entry, no full CRUD api client. (MEDIUM) Plan's behavioral tests (archive-vs-delete, tenant isolation, store-scoped metrics, batch supplier assignment) have no integration coverage. (LOW) "Estimated revenue" supplier metric not implemented.

## Phase 21 — Digital Reports & Profit Analytics — 🟡 PARTIAL (already started ahead of this audit)

- Code exists (commit `749b1ee`): `apps/api/src/modules/digital-reports/*` (service/math/serializer/schemas/controller/routes + 3 tests) and `apps/dashboard/src/pages/digital-reports/DigitalReportsPage.tsx` (+ nav + route + api client). All 7 logical reports present (summary/inventory/sales/profit/suppliers/delivery/low-stock). Not deeply audited here.

---

## Cross-cutting findings

1. **RBAC divergence (`digital_delivery.*`).** Plan §3 specifies `.view/.assign/.resend/.replace/.refund`; code has `.view/.assign/.deliver/.retry`. There is **no distinct `.refund` or `.replace` permission** — replacement/refund are gated under `.assign`/`.retry`. Decide whether the plan's granular gating is required before Phase 24.
2. **Frontend routes: 3 of 9 planned exist.** Present: `/digital-inventory`, `/digital-inventory/batches`, `/digital-reports`. Missing: `/digital-inventory/batches/:id`, `/digital-inventory/codes/:id`, `/digital-delivery`, `/digital-delivery/orders/:orderId`, `/suppliers`, `/suppliers/:id`. Sidebar has only 2 digital entries (inventory, reports).
3. **No phase-status doc previously existed** — `docs/README.md` is a stub pointing at `plan.md`. This file (`docs/status.md`) and the updated table in `plan2.md §8` now track real status.

## Is it safe to start Phase 21?

- **Data dependencies:** YES — Phase 21 reports read assignments, deliveries, supplier costs, and code statuses, all of which the Phase 17–20 **backends** produce. Build and tests are green.
- **Reality check:** Phase 21 is **already implemented** (backend + frontend + tests), so "starting" it is largely moot.
- **Recommendation (now resolved by Phase 20.5):** the operator-facing gaps in 17–20 have been closed — see below.

---

## Phase 20.5 — Digital Operations UI & Support Gap Closure (✅ COMPLETED 2026-06-27)

A remediation phase (not in the original plan) that closes the 17–20 frontend gaps and the Phase 19 backend gaps surfaced by the audit. No Phase 22 work; no customer self-service.

### 1. Digital delivery frontend (Phases 17–19)
- `/digital-delivery` — manual review queue (`DigitalDeliveryQueuePage`): status filter + search + pagination, loading/empty/error/no-access states.
- `/digital-delivery/orders/:orderId` — standalone order delivery page (`DigitalDeliveryOrderPage`).
- Reusable `components/digital-delivery/OrderDigitalSection.tsx` — digital status, masked assignments table, delivery history, and the full action toolkit: assign / deliver / retry / manual-assign / release, plus per-code reveal (existing audited endpoint) / resend / replace / status-change / mark-invalid. **Embedded in the Phase-7 `OrderDetailsPage`** (gated by `digital_delivery.view`).
- Action dialogs: `ReplaceCodeDialog`, `ManualAssignDialog`, `AssignmentStatusDialog`, `MarkInvalidDialog`, `ReleaseDialog`; reused `RevealCodeDialog`.
- `lib/digital-delivery-api.ts` client. Codes are never shown in lists; full reveal stays on the dedicated audited endpoint.

### 2. Suppliers frontend (Phase 20)
- `/suppliers` (`SuppliersListPage`) — table, search + status filter, create, pagination, no-access state.
- `/suppliers/:id` (`SupplierDetailsPage`) — supplier data, performance metrics tiles, linked-products section (link/edit/unlink), code-batches section, edit + archive.
- Dialogs `SupplierFormDialog`, `SupplierProductDialog`; extended `lib/suppliers-api.ts` to full CRUD + details + products + batches + metrics.

### 3. Phase 19 backend gaps closed
- `POST /digital-delivery/assignments/:id/resend` (`digital_delivery.resend`) — re-delivers an assignment's code without creating a new assignment.
- `PATCH /digital-delivery/assignments/:id/status` (`digital_delivery.refund`) — cancel/refund/fail one assignment; delivered codes are locked as `refunded`, never returned to stock (pure, unit-tested `decideAssignmentStatusOutcome`).
- `POST /digital-inventory/codes/:id/mark-invalid` (`digital_inventory.edit`) — audited "supplier said it's bad" shortcut.
- New audit actions: `digital_code_resent`, `digital_code_marked_invalid`, `digital_assignment_refunded`, `digital_assignment_cancelled`.

### 4. Refund/cancel webhook safe-release
- `webhooks.service.ts` now calls `maybeReleaseCodesForOrder` when an order becomes `cancelled`/`refunded`. Best-effort (never throws), idempotent (skips terminal/empty orders), and **never returns delivered/revealed codes to stock** — only undelivered reserved codes are released. Recorded as a system audit entry.

### 5. RBAC alignment (no weakening)
- Added `digital_delivery.resend`, `.replace`, `.refund` (the plan §3 names). Granted resend+replace to Manager/Order-Employee/Customer-Support; refund to Manager (Owner = all). Replace route moved from `.assign` → `.replace` (every role that could replace before still can; Customer-Support gains it per plan §3.1). `digital_delivery.deliver`/`.retry` retained for backward compatibility. `reveal`/`export`/`delete` grants untouched.

### Navigation / routes
- Sidebar now has «تسليم الأكواد» (`digital_delivery.view`) and «الموردين» (`digital_suppliers.view`). Four new routes registered (lazy-loaded).

### Verification
- API: typecheck clean, **293/293 unit tests pass** (+5 for the new schemas/transition logic), lint clean.
- Dashboard: production build clean, lint clean (each new page ships its own chunk).
- **Not browser-tested:** the new pages sit behind auth and need PostgreSQL/Redis + a live API, which are unavailable here (same constraint as Phases 13–20); verified structurally.

### Remaining risks / follow-ups
- Order-level `POST /orders/:orderId/release` still uses `digital_delivery.retry` (unchanged to avoid weakening); the new granular per-assignment refund/cancel uses `digital_delivery.refund`. Reconcile if the plan wants a single gate.
- Assignment-level resend re-delivers the whole order's codes via the order-scoped engine (no single-code delivery path exists) — consistent with order-level retry; documented.
- New `digital_delivery.*` permissions require a `db:seed` run to materialize in an existing database before the new endpoints/nav are usable.
- The minor Phase 15 gap (digital badge on the product **list** page) remains out of scope for 20.5.
- No live WooCommerce/DB round-trip was exercised (no environment).

---

## Phase 22 — Customer Self-Service Code Access (✅ COMPLETED 2026-06-27)

Secure customer portal: staff generate a signed, expiring link; customers view their delivered codes with no login. No codes in WordPress; every view recorded. Full detail in [digital-customer-access-report.md](../digital-customer-access-report.md) and security audit in [digital-customer-security-review.md](../digital-customer-security-review.md).

### What shipped
- **DB (migration `0017_customer_self_service`):** `customer_access_tokens` (HMAC-hash only, expiry, max_uses, used_count, revoked_at; unique token_hash) and `customer_code_views` (per-view access log: viewed/copied + ip/ua).
- **Token model:** 256-bit random token → keyed HMAC-SHA256 at rest under a **dedicated** `CUSTOMER_TOKEN_HASH_KEY`. Default expiry 7d (max 30); default `max_uses = 1` (single-use; unlimited opt-in). One active token per order (new link revokes prior, advisory-lock serialized).
- **Staff endpoints (JWT, `digital_delivery.customer_link` / `.view`):** `POST /digital-delivery/orders/:orderId/customer-link`, `GET …/customer-links`, `POST /digital-delivery/customer-links/:id/revoke`.
- **Public endpoints (NO JWT, token in body, rate-limited, no-store):** `POST /public/digital-orders/lookup` (masked previews), `POST /public/digital-orders/reveal` (`viewed` → one full code, consumes a use, records view; `copied` → log only).
- **Frontend:** public `/digital-order/:token` page (Arabic RTL, no layout/auth, per-code show/copy/hide) + `CustomerLinkDialog` in `OrderDigitalSection` (generate/copy/revoke).
- **Audit:** `digital_customer_link_created` / `digital_customer_link_revoked` (never the token); customer views in `customer_code_views`.
- **Hardening:** token only in body (never URL); `request-logger` redacts auth/cookie headers; `Referrer-Policy: no-referrer` (index.html); per-IP + per-token rate limits; generic uniform rejection; atomic max-use enforcement; tenant+order-scoped queries.

### Security review
PASS. Two WEAK findings raised and **fixed**: (1) Referer/history leakage → parse-time `no-referrer` meta + page-level policy; (2) one-active-token race → transaction advisory lock.

### Verification
API typecheck/lint clean · **312/312 unit tests** (+19) · dashboard build (incl. tsc)/lint clean · security review PASS.

### Not done here (requires a deployed stack)
- Live manual QA (10 scenarios) needs PostgreSQL/Redis + migrations through `0017` + `CUSTOMER_TOKEN_HASH_KEY` + `npm run db:seed` (to materialize the new permission). Verified structurally (code trace + unit tests + security audit) here, consistent with prior phases.
- Deployment notes: also set a `Referrer-Policy: no-referrer` response header at the host/CDN; HTTPS only.

### Out of scope (later phases)
No email/WhatsApp/WordPress-connector delivery of the link (staff send it manually); no Phase 23+ work.

---

## Phase 23 — Digital Automations Expansion (✅ COMPLETED 2026-06-28)

Extends the Phase 11 automations module with six digital-product automations. Full detail in [digital-automations-report.md](../digital-automations-report.md).

### What shipped
- **Six automation types** (the seventh plan2 type `digital_supplier_quality_alert` is intentionally OUT OF SCOPE): `digital_low_stock_alert`, `digital_out_of_stock_alert`, `digital_failed_delivery_alert`, `digital_replacement_rate_alert`, `auto_assign_codes_on_paid_order`, `auto_deliver_codes_on_paid_order`.
- **No migration / no new RBAC.** Reuses the existing `automations` + `automation_logs` tables (lazily provisions the six new rows per store via `ensureAutomations`), `automations.view`/`.edit`, the generic audit (enable/disable/config), and the `createNotification` seam. Added four notification types (`digital_low_stock`, `digital_out_of_stock`, `digital_delivery_failed`, `digital_replacement_rate`).
- **Config (all strict Zod; `enabled` = the row column, as in Phase 11):** low-stock `{thresholdMode, globalThreshold?}`, out-of-stock `{notifyRoles?}`, failed-delivery `{maxAttempts}`, replacement-rate `{windowDays, maxReplacementRate}`, auto-assign `{statuses, allowPartial}`, auto-deliver `{statuses, channel}`.
- **Run helpers REUSE the engines** — `assignCodesForOrder` (Phase 17), `deliverCodesForOrder` (Phase 18), `createCustomerLink`/`listCustomerLinks` (Phase 22). No assignment/delivery/link logic duplicated; idempotency and double-sell safety inherited. Disabled → skipped+logged; failures → failed log + `failed_automation` notification.
- **Anti-spam:** alerts skip when nothing to report; failed-delivery scopes to "since the previous run"; replacement-rate debounces within its window; auto-assign/deliver are idempotent and the customer-link path dedups on an active link.
- **Security:** no raw codes/ciphers/customer tokens in logs/notifications/audit (ids/counts/status only); the auto-deliver `customer_link` path discards the raw token. Tenant-scoped throughout. No WordPress connector changes.
- **Queues/jobs:** registered `digital_inventory` / `digital_delivery` queues + six job names as foundation (synchronous helpers, no worker yet — same posture as Phase 11). CLI: `npm run automations:run <type> <storeId>`.
- **Frontend:** `/automations` now has «الأتمتة العامة» and «أتمتة المنتجات الرقمية» sections; six digital cards with per-type config editors (threshold mode/value, role list, max attempts, window+rate, status chips, allow-partial switch, channel select), enabled toggle, save, shared run-logs panel; permission-gated; loading/error/empty/no-access states; light/dark.

### Verification
- API: typecheck clean, **332/332 unit tests** (+20 for the new config + logic), lint clean.
- Dashboard: production build (incl. tsc) clean, lint clean.
- **Not browser-tested / no live round-trip:** needs PostgreSQL/Redis + a live API (same constraint as Phases 13–22); verified by the unit-tested pure logic + the engines' existing tests + code-level tenant-scoping.

### Remaining / follow-ups
- Wiring the helpers to a scheduled BullMQ worker (the registered queues) is the future step; the webhook auto-assign/deliver (Phase 17/18, product-settings driven) was left unchanged.
- Existing stores provision the six new automation rows lazily on the next `GET /automations` (no migration/seed).

---

## Phase 24 — Production Readiness, Hardening & Release Candidate (✅ COMPLETED 2026-06-28)

Full audit of Phases 15–23. No new business features — fixes only. See `production-readiness-report.md` (full report) and `release-candidate-report.md` (RC gate).

### Confirmed issues fixed
- **DB (HIGH):** Added `code_assignments_store_assigned_at_idx` composite index on `(store_id, assigned_at)` — migration `0018_code_assignments_assigned_at_idx.sql`. Required for replacement-rate automation and profit-report date-range queries.
- **Frontend (MEDIUM):** Un-debounced search in `DigitalDeliveryQueuePage` and `SuppliersListPage` caused one API call per keystroke and a double-fetch on filter change. Fixed with new `useDebounce` hook (`hooks/useDebounce.ts`, 300 ms).
- **Security (LOW):** Pino redaction paths extended to include `*.code`, `*.codeHash`, `*.tokenHash` — defense-in-depth against accidental raw-code or HMAC-fingerprint logging.
- **Code quality (MEDIUM):** `GET /stores/current` controller used direct `errorResponse()` instead of `throw NotFoundError()` — fixed for consistency.
- **Code quality (LOW):** `GET /stores/current` route had no `requirePermission` with no comment explaining the intentional omission — added explanatory comment.
- **Reliability (MEDIUM):** No boot-time guard if only one of `DIGITAL_CODE_ENCRYPTION_KEY` / `DIGITAL_CODE_HASH_KEY` was set — added `process.exit(1)` guard in `env.ts`.
- **Code quality (MEDIUM):** Identical `paginate()` helper duplicated in two controllers — extracted to `lib/paginate.ts`.
- **Documentation:** `deployment-checklist.md` migration reference updated (0011 → 0018); `CUSTOMER_TOKEN_HASH_KEY` added to secrets section; `environment-reference.md` Phase 22 variables section added.

### New documentation
`docs/PRODUCTION_ENVIRONMENT.md`, `docs/DEPLOYMENT_GUIDE.md`, `docs/OPERATIONS_GUIDE.md`, `docs/BACKUP_AND_RESTORE.md`, `docs/TROUBLESHOOTING.md`, `docs/RELEASE_CHECKLIST.md`

### Accepted for pilot (not fixed)
- Webhook endpoints lack independent rate limiting (connector key auth is the primary guard)
- WooCommerce sync runs inline (BullMQ workers are the post-pilot path)
- No trigram indexes for ILIKE search (add `pg_trgm` extension post-pilot)

### Verification
- API: typecheck clean · **332/332 unit tests** · lint clean
- Dashboard: production build (incl. tsc) clean · lint clean · no chunk > 500 KB
