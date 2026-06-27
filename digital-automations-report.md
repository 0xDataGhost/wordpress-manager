# Phase 23 — Digital Automations Expansion: Implementation Report

> Date: 2026-06-28 · Status: **code-complete, all automated checks green.**
> Extends the existing automations module (Phase 11) with six digital-product
> automations. Reuses the existing notifications seam, automation logs, and the
> Phase 17/18/22 assignment, delivery, and customer-link engines — no assignment
> or delivery logic was duplicated. No WordPress connector changes.

## Scope delivered

Six automation types (the seventh plan2 type `digital_supplier_quality_alert` was
explicitly **out of scope** and is not implemented):

| Type | Behavior |
|---|---|
| `digital_low_stock_alert` | Notify when a digital product's available pool is low (but not empty) under a per-product or global threshold. |
| `digital_out_of_stock_alert` | Notify (error) when a digital product's available pool hits zero. |
| `digital_failed_delivery_alert` | Notify when a delivery has failed ≥ `maxAttempts` times — scoped to "since the previous run" so old failures are not re-alerted. |
| `digital_replacement_rate_alert` | Notify when the replacement rate over `windowDays` exceeds `maxReplacementRate`; debounced so it stays quiet for the rest of the window. |
| `auto_assign_codes_on_paid_order` | Reserve/assign codes for eligible paid orders by **reusing** `assignCodesForOrder` (idempotent). |
| `auto_deliver_codes_on_paid_order` | Deliver assigned codes for eligible paid orders by **reusing** `deliverCodesForOrder` (idempotent); for the `customer_link` channel, ensures one active customer link without creating duplicates. |

## Key design decisions

- **`enabled` is the automation row column**, not a config key — the plan's
  per-automation `enabled` field maps to the existing `automations.enabled`
  column (the operational switch checked by `skipIfDisabled`), exactly as the
  Phase 11 automations work. Configs hold the remaining fields, all Zod-validated
  `.strict()`.
- **No duplicated business logic.** The auto-assign/deliver helpers call the
  existing engines; idempotency, double-sell protection, and money-safety come
  for free from those engines. The customer-link path reuses
  `createCustomerLink`/`listCustomerLinks`.
- **Synchronous foundation (no worker).** Like Phase 11, the run helpers execute
  synchronously and are invoked via `npm run automations:run`. The new queues
  (`digital_inventory`, `digital_delivery`) and job names are registered as the
  seam a future worker will consume. The webhook path was **not** modified
  (existing Phase 17/18 auto-assign/deliver via product settings is unchanged),
  keeping this change additive and low-risk.
- **Anti-spam.** Alerts skip (no notification) when there is nothing to report;
  failed-delivery scopes to failures since the previous run; replacement-rate
  debounces within its window.

## Security

- No raw codes, ciphers, or customer tokens in any log, notification, or audit
  metadata — only ids, counts, statuses, and thresholds.
- The auto-deliver `customer_link` path discards the raw token returned by
  `createCustomerLink` (never captured or logged) and degrades gracefully when
  customer-link crypto is unconfigured.
- All queries are tenant-scoped by `store_id`; every helper resolves its data
  from the store id only.
- Failures write a `failed` automation log **and** a `failed_automation`
  notification via the existing `recordFailure` seam; disabled automations are
  skipped and logged via `skipIfDisabled`.
- Audit logging of enable/disable/config-update is inherited from the existing
  generic automations controller (works for the new types with no change).

## Files created

**Backend (API):**
- `apps/api/src/modules/automations/digital-automations.logic.ts` — pure decision
  helpers (thresholds, low/out-of-stock selection, replacement rate, status
  eligibility, active-link dedup).
- `apps/api/src/modules/automations/digital-automations.logic.test.ts` (8 tests).
- `apps/api/src/modules/automations/digital-automations.config.test.ts` (12 tests).

**Frontend (dashboard):**
- `apps/dashboard/src/components/automations/digital-automation-display.ts` —
  Arabic meta + option labels for the six digital automations.
- `apps/dashboard/src/components/automations/AutomationLogsPanel.tsx` — shared,
  extracted run-logs panel (used by both classic and digital cards).
- `apps/dashboard/src/components/automations/DigitalAutomationCard.tsx` — the
  digital card with per-type multi-field config editors.

## Files modified

**Backend (API):**
- `db/schema/automations.ts` — added `DIGITAL_AUTOMATION_TYPES`; `AUTOMATION_TYPES`
  now spans classic + digital.
- `db/schema/notifications.ts` — added `digital_low_stock`, `digital_out_of_stock`,
  `digital_delivery_failed`, `digital_replacement_rate` types.
- `modules/automations/automations.config.ts` — six strict Zod config schemas +
  defaults; `DIGITAL_AUTOMATION_TYPE_ORDER` / `ALL_AUTOMATION_TYPE_ORDER`.
- `modules/automations/automations.service.ts` — six run helpers
  (`runDigitalLowStockAlert`, `runDigitalOutOfStockAlert`,
  `runDigitalFailedDeliveryAlert`, `runDigitalReplacementRateAlert`,
  `runAutoAssignCodesOnPaidOrder`, `runAutoDeliverCodesOnPaidOrder`) + shared
  query/anti-spam helpers; `ensureAutomations` now provisions all nine types.
- `queue/queues.ts` — `DIGITAL_AUTOMATION_QUEUE_NAMES` + `DIGITAL_AUTOMATION_JOB_NAMES`,
  registered at boot.
- `scripts/run-automation.ts` — runs the six new types from the CLI.

**Frontend (dashboard):**
- `lib/automations-api.ts` — `ClassicAutomationType` / `DigitalAutomationType` /
  combined `AutomationType`.
- `pages/automations/AutomationsListPage.tsx` — split into «الأتمتة العامة» and
  «أتمتة المنتجات الرقمية» sections; loading/error/empty/no-access states preserved.
- `components/automations/AutomationCard.tsx` — refactored to use the shared
  `AutomationLogsPanel`.
- `components/automations/automation-display.ts` — `AUTOMATION_META` re-keyed to
  the classic-only union.
- `lib/notifications-api.ts` + `components/notifications/notification-display.ts` —
  Arabic labels for the new digital notification types.

## Automations added

`digital_low_stock_alert`, `digital_out_of_stock_alert`,
`digital_failed_delivery_alert`, `digital_replacement_rate_alert`,
`auto_assign_codes_on_paid_order`, `auto_deliver_codes_on_paid_order`.

Config schemas (all `.strict()`, Zod-validated; `enabled` is the row column):
- `digital_low_stock_alert`: `{ thresholdMode: "product_setting" | "global", globalThreshold?: number }` (globalThreshold required in global mode).
- `digital_out_of_stock_alert`: `{ notifyRoles?: string[] }`.
- `digital_failed_delivery_alert`: `{ maxAttempts: number ≥ 1 }`.
- `digital_replacement_rate_alert`: `{ windowDays: number ≥ 1, maxReplacementRate: number 0..1 }`.
- `auto_assign_codes_on_paid_order`: `{ statuses: OrderStatus[], allowPartial: boolean }`.
- `auto_deliver_codes_on_paid_order`: `{ statuses: OrderStatus[], channel: "customer_link" | "dashboard" }`.

## Tests added (20 new; 332 total API tests pass)

- `digital-automations.config.test.ts` — every default validates; per-type schema
  validation (global-threshold requirement, strict unknown-key rejection, status
  membership, channel enum, bounds); `normalizeConfig` merge + fallback; the six
  types recognised and ordered last (supplier-quality absent).
- `digital-automations.logic.test.ts` — threshold resolution, low/out-of-stock
  partitioning (empty excluded from low), replacement-rate + strict breach,
  status eligibility, active-customer-link dedup (ignores revoked/expired).

The DB-backed run helpers follow the codebase convention (no live DB in this
workspace): their tricky decisions are extracted into the unit-tested pure logic
module, and idempotency/double-sell safety is inherited from the already-tested
Phase 17/18 engines.

## Checks run

| Check | Result |
|---|---|
| API typecheck (`tsc --noEmit`) | ✅ PASS |
| API lint (`eslint`) | ✅ PASS |
| API unit tests (`tsx --test`) | ✅ **332 / 332** (+20) |
| Dashboard build (`tsc -b && vite build`) | ✅ PASS |
| Dashboard lint (`eslint`) | ✅ PASS |
| PHP lint | N/A — no connector files changed |

## Remaining risks

- **No worker / not webhook-wired (by design).** The run helpers execute
  synchronously and are invoked manually (`npm run automations:run`). Wiring them
  to a scheduled BullMQ worker (the registered `digital_inventory` /
  `digital_delivery` queues) is the future step — identical to the Phase 11
  posture. The existing Phase 17/18 webhook auto-assign/deliver (driven by product
  settings) is unchanged and independent of these automation toggles.
- **No live round-trip exercised** (no PostgreSQL/Redis/WooCommerce here, the
  documented constraint since Phase 13). Behavior is verified by the pure-logic
  unit tests + the engines' existing tests + code-level tenant-scoping. A live QA
  pass should run each helper against a seeded store.
- **`notifyRoles` is advisory.** Notifications are store-scoped (visible to anyone
  with `dashboard.view`); `notifyRoles` is carried in metadata only and does not
  restrict recipients. Documented in the UI hint.
- **Existing stores need a read to provision** the six new automation rows
  (lazy `ensureAutomations` on the next `GET /automations`) — no migration or
  seed required (no new tables, no new RBAC permissions).

## Phase 23 status

**Complete (code-complete; pending live QA).** All six automation types,
configs, run helpers, queues/jobs, tests, and the dashboard «أتمتة المنتجات
الرقمية» section are implemented; all automated checks are green. Phase 24 was
not started (out of scope).
