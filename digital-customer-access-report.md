# Phase 22 — Customer Self-Service Code Access: Implementation Report

> Date: 2026-06-27 · Status: **code-complete, all automated checks green, security review PASS.**
> Customers can now view the digital codes they purchased through a staff-generated,
> signed, expiring link — with no login, no codes in WordPress, and every view recorded.

## Overview of the flow

**Staff:** Order details → *رابط العميل* → choose expiry + use limit → Generate → copy link → send manually (no email/WhatsApp/connector — those are later phases). Generating a new link auto-revokes the previous active one (one active link per order).

**Customer:** open `/digital-order/:token` → see store + order + products + instructions with **masked** codes → press *عرض* on a code → reveal one code → *نسخ* → *إخفاء*. Each code reveals independently; codes are never all revealed at once.

## Files created

**Backend (API):**
- `apps/api/drizzle/0017_customer_self_service.sql` — migration (two tables, FKs, indexes).
- `apps/api/src/db/schema/customer-access-tokens.ts`
- `apps/api/src/db/schema/customer-code-views.ts`
- `apps/api/src/lib/customer-token.ts` (+ `customer-token.test.ts`)
- `apps/api/src/modules/customer-access/customer-access.policy.ts` (+ `.test.ts`)
- `apps/api/src/modules/customer-access/customer-access.schemas.ts` (+ `.test.ts`)
- `apps/api/src/modules/customer-access/customer-access.serializer.ts` (+ `.test.ts`)
- `apps/api/src/modules/customer-access/customer-access.service.ts`
- `apps/api/src/modules/customer-access/customer-access.controller.ts`
- `apps/api/src/modules/customer-access/customer-access.routes.ts`
- `apps/api/src/modules/digital-delivery/customer-link.schemas.ts` (+ `.test.ts`)
- `apps/api/src/modules/digital-delivery/customer-link.serializer.ts`
- `apps/api/src/modules/digital-delivery/customer-link.service.ts`
- `apps/api/src/modules/digital-delivery/customer-link.controller.ts`

**Frontend (dashboard):**
- `apps/dashboard/src/lib/customer-access-api.ts` (public client, `auth:false`)
- `apps/dashboard/src/pages/public/DigitalOrderPage.tsx` (public page, no layout/auth)
- `apps/dashboard/src/components/digital-delivery/CustomerLinkDialog.tsx` (staff)

## Files modified

**Backend:** `db/schema/index.ts` (export new tables); `db/schema/audit-logs.ts` (2 actions); `config/env.ts` (8 new vars); `config/rbac.ts` (new permission + grants); `middleware/rate-limit.ts` (optional `keyBy`); `middleware/request-logger.ts` (header redaction); `modules/digital-delivery/digital-delivery.routes.ts` (3 staff routes); `routes/index.ts` (`/public` mount); `scripts/generate-secrets.ts` (`CUSTOMER_TOKEN_HASH_KEY`); `.env.example`.

**Frontend:** `lib/digital-delivery-api.ts` (staff link functions + types); `components/digital-delivery/OrderDigitalSection.tsx` (link button + dialog); `routes/AppRoutes.tsx` (public route, outside auth/layout); `index.html` (`Referrer-Policy` meta).

## Database changes (migration `0017_customer_self_service`)

- **`customer_access_tokens`** — `id, store_id, order_id, customer_id, token_hash, expires_at, max_uses, used_count, revoked_at, created_by, created_at, updated_at`. Indexes: **unique** `token_hash`; `(store_id, order_id)`; `(expires_at)`. Stores only the HMAC hash — never the raw token.
- **`customer_code_views`** — `id, store_id, code_id, assignment_id, order_id, customer_id, token_id, viewer_user_id, viewer_type, action ('viewed'|'copied'), ip_address, user_agent, created_at`. Indexes: `(store_id, code_id)`, `(store_id, order_id)`, `(store_id, created_at, id)`. Single self-service analytics/access-log table (no separate analytics table).

## Endpoints added

**Staff (JWT, tenant-scoped):**
- `POST /digital-delivery/orders/:orderId/customer-link` — `digital_delivery.customer_link`. Requires ≥1 delivered code. Auto-revokes prior active tokens (advisory-lock serialized). Returns `{ id, token, url, expiresAt, maxUses }` (token once).
- `GET /digital-delivery/orders/:orderId/customer-links` — `digital_delivery.view`. Lists links (status/expiry/uses) — never the token.
- `POST /digital-delivery/customer-links/:id/revoke` — `digital_delivery.customer_link`.

**Public (NO JWT, token in body, rate-limited, `Cache-Control: no-store`):**
- `POST /public/digital-orders/lookup` — `{ token }` → order + products + **masked** previews. Moderate per-IP limit.
- `POST /public/digital-orders/reveal` — `{ token, codeId, action }`. `viewed` → decrypts and returns ONE code (consumes a use, records `viewed`); `copied` → records `copied` only (no code). Strict per-IP + per-token limit.

## Frontend pages added

- **Public:** `/digital-order/:token` — Arabic RTL, responsive, no dashboard layout/auth. States: loading / invalid (generic, covers expired/revoked) / no-codes / success. Per-code show → reveal → copy → hide; revealed values cached in memory only (re-show consumes no extra use); copy fires a best-effort `copied` log.
- **Dashboard:** `CustomerLinkDialog` inside `OrderDigitalSection` — generate (expiry + single/unlimited), copy link, list existing links, revoke. Gated by `digital_delivery.customer_link`.

## Token model (as implemented)

256-bit token → stored as keyed HMAC-SHA256 (dedicated `CUSTOMER_TOKEN_HASH_KEY`). Default expiry 7 days (max 30). **Default `max_uses = 1`** (single-use); staff may choose unlimited. `used_count` counts `viewed` reveals and is enforced atomically; `lookup` and `copied` do not consume uses. One active token per order (new link revokes old, serialized by advisory lock).

## Audit & view logging

- Staff: `digital_customer_link_created` / `digital_customer_link_revoked` (ids + lifecycle metadata only — never the token).
- Customer: every `viewed` and `copied` recorded in `customer_code_views` with token id, IP, and user agent.

## Tests added (19 new; 312 total API tests pass)

- `customer-token.test.ts` — generation/uniqueness/URL-safety, HMAC determinism + key separation, missing-key safe throw (no token in message), constant-time compare, non-reversible rate key.
- `customer-access.policy.test.ts` — accessible vs revoked/expired; `max_uses` not blocking access; full lifecycle status incl. unlimited.
- `customer-access.schemas.test.ts` — token/codeId/action validation, strict unknown-key rejection, default action.
- `customer-access.serializer.test.ts` — grouping by product; **asserts no cipher/iv/tag/hash/raw code**; masked previews only; empty set.
- `customer-link.schemas.test.ts` — create body (defaults, null=unlimited, bounds), uuid param, strict rejection.

## Checks run (all PASS)

| Check | Result |
|---|---|
| API typecheck | ✅ PASS |
| API lint | ✅ PASS |
| API unit tests | ✅ **312 / 312** |
| Dashboard build (incl. `tsc`) | ✅ PASS |
| Dashboard lint | ✅ PASS |
| Security review | ✅ PASS (2 WEAK findings fixed) |

## Manual QA (verification status)

No PostgreSQL/Redis or live WooCommerce environment is available in this workspace (documented constraint since Phase 13), so the 10 manual-QA scenarios were verified by **code trace + unit tests + the independent security audit**, not a live click-through. Expected results and evidence:

| # | Scenario | Expected | Evidence |
|---|---|---|---|
| 1 | Generate → open → reveal → copy → view logged | code revealed once; `customer_code_views` rows for viewed+copied | service `revealCustomerCode` (atomic use + insert), `customer-access.service.ts` |
| 2 | Generate 2nd link → old revoked | exactly one active token | `createCustomerLink` revoke-then-insert + advisory lock |
| 3 | Expired link | generic invalid | `isTokenAccessible` (expiry) → `rejectGeneric` |
| 4 | Revoked link | generic invalid | `isTokenAccessible` (revoked) → `rejectGeneric` |
| 5 | Wrong/garbage token | generic invalid | HMAC lookup miss → `rejectGeneric` |
| 6 | Max uses reached | reveal blocked, generic | atomic guarded `used_count < max_uses` |
| 7 | Multiple products | grouped per product | `toPublicOrderView` (+ serializer test) |
| 8 | Multiple codes | each revealed independently | per-code reveal; `lookup` returns all masked |
| 9 | Tenant isolation | no cross-store/order access | all queries scoped to token `store_id`+`order_id` (security audit: PASS) |
| 10 | No raw code anywhere except reveal | confirmed | serializer test + audit (PASS) |

**Required before declaring live-QA done:** deploy with PostgreSQL/Redis, run migrations through `0017`, set `CUSTOMER_TOKEN_HASH_KEY` (+ `DIGITAL_CODE_ENCRYPTION_KEY`), run `npm run db:seed` to materialize the new permission, then execute the 10 scenarios against the running stack.

## Remaining risks

- **Token in browser history** (inherent to a shareable URL link) — mitigated by short expiry, single-use default, revoke, view logging, and `Referrer-Policy: no-referrer`. A fragment-based token would remove it entirely (future hardening).
- **Rate limiter fails open** on a Redis outage (consistent with existing limiters).
- **Seed required:** the new `digital_delivery.customer_link` permission needs `npm run db:seed` in an existing DB before staff can generate links.
- **Deployment note:** also set `Referrer-Policy: no-referrer` at the static host/CDN; provision a strong dedicated `CUSTOMER_TOKEN_HASH_KEY`; serve over HTTPS only.
- **Live round-trip not exercised here** (no environment).

## Production-readiness recommendation

**Code-complete and production-ready pending a live pilot QA pass.** All automated checks are green and the security review is PASS with both findings fixed. The only outstanding item is executing the manual QA against a deployed stack (not possible in this workspace), plus the standard deployment configuration above. No code-level blockers remain.
