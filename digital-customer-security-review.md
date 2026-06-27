# Phase 22 — Customer Self-Service: Security Review

> Date: 2026-06-27 · Scope: the Phase 22 customer self-service portal only.
> Method: dedicated adversarial code audit (independent reviewer) of every new
> file, assuming an attacker holds a leaked or guessed link. Digital codes are
> treated as money. Re-verified after fixes were applied.

## Threat verdict table (post-fix)

| # | Threat | Verdict |
|---|--------|---------|
| 1 | Token leakage (storage / logs / URL / responses) | ✅ PASS *(after fix)* |
| 2 | Token strength & hashing | ✅ PASS |
| 3 | Replay / reuse / max-use bypass | ✅ PASS *(after fix)* |
| 4 | Brute force (rate limiting) | ✅ PASS |
| 5 | Timing attacks / oracle | ✅ PASS |
| 6 | Log leakage (codes / tokens / hashes) | ✅ PASS |
| 7 | Cache leakage (browser / CDN) | ✅ PASS |
| 8 | Tenant & order isolation | ✅ PASS |
| 9 | RBAC | ✅ PASS |
| 10 | Audit integrity | ✅ PASS |

**Overall: PASS.** Two WEAK findings were raised and both were fixed; no CRITICAL/HIGH issue was found.

## Core design (verified sound)

- **Token:** 256-bit CSPRNG (`randomBytes(32)` base64url), returned once at creation; never stored, never logged, never in any list/response.
- **Storage:** only a **keyed HMAC-SHA256** fingerprint (`token_hash`) is persisted, under a **dedicated** secret `CUSTOMER_TOKEN_HASH_KEY` (explicitly NOT `DIGITAL_CODE_HASH_KEY`). Lookup is an indexed equality on the HMAC — no app-level non-constant compare.
- **Transport:** the token is carried in the **request body** (`POST`), never the URL. `pino-http` does not log bodies, and `request-logger` additionally redacts `authorization`/`cookie` headers.
- **Validation order (uniform generic 404 on every failure):** hash match → not revoked → not expired → (for reveal) `max_uses` not exceeded → code belongs to the token's order + store → delivered-only. A single Arabic message `هذا الرابط غير صالح أو منتهي الصلاحية.` is returned for all rejection reasons, so no oracle distinguishes invalid / expired / revoked / exhausted / cross-order / cross-store.
- **Atomic use accounting:** `viewed` reveals consume a use via a guarded `UPDATE … SET used_count = used_count + 1 WHERE id = … AND revoked_at IS NULL AND expires_at > now() AND (max_uses IS NULL OR used_count < max_uses) RETURNING id`; a 0-row result rejects. Concurrent reveals can never exceed `max_uses` (row lock). The code is decrypted **before** the increment so a corrupt code never burns a use.
- **`copied` action:** logs a `customer_code_views` row only; returns no code; does not consume a use; is not blocked by `max_uses` — and cannot be abused to obtain a code.
- **Rate limiting:** lookup = per-IP (moderate); reveal = per-IP **and** per-token (strict). The per-token bucket key is a one-way SHA-256 fingerprint of the token (never the raw token).
- **Cache:** `Cache-Control: no-store` on both public responses; endpoints are POST (not CDN-cacheable).
- **Isolation:** every public query is scoped to the token row's `store_id` **and** `order_id`; reveal additionally requires the `codeId` to be a `delivered` assignment of that order. A token can never reach another order or store.
- **No code exposure:** lookup/serializers expose only `{ id, codePreview }` (masked); the full plaintext is returned only by `reveal('viewed')`. A serializer unit test asserts no `cipher`/`iv`/`tag`/`hash` field is ever present.
- **RBAC:** staff create/revoke require `digital_delivery.customer_link` (granted Owner/Manager/Order-Employee/Customer-Support); list requires `digital_delivery.view`; the public endpoints have no auth by design but require a valid token.
- **Audit:** `digital_customer_link_created` / `digital_customer_link_revoked` record ids + lifecycle metadata only — never the token. Customer views are recorded in `customer_code_views` (`viewed`/`copied`) with IP + user agent.

## Findings raised and FIXED

### WEAK-1 — Token reachable via the Referer header / browser history (FIXED)
The customer page is routed at `/digital-order/:token`, so the token is in the SPA URL. The API never sees it in a URL, but a third-party subresource (e.g. Google Fonts) or outbound navigation could leak it via `Referer`.
- **Fix applied:** added `<meta name="referrer" content="no-referrer" />` to `apps/dashboard/index.html` **before** any subresource request, plus the page already injects the same policy on mount. Recommend the static host also send a `Referrer-Policy: no-referrer` header (deployment note).
- **Residual:** the token still lives in browser history (inherent to a shareable URL link). Mitigated by short default expiry (7 days), default single-use (`max_uses = 1`), staff revoke, and full view logging. A fragment-based token (`#`) would remove the history/Referer vector entirely and is recommended as a future hardening if required.

### WEAK-2 — "One active token per order" race under concurrent creates (FIXED)
At READ COMMITTED, two simultaneous staff "generate link" calls for the same order could both revoke-then-insert and leave two active tokens.
- **Fix applied:** `createCustomerLink` now takes a transaction-scoped advisory lock keyed on `store_id:order_id` (`pg_advisory_xact_lock(hashtext(...)::bigint)`) before the revoke+insert, serializing concurrent creates for the same order. The invariant now holds without surfacing an error. (A partial unique index `(store_id, order_id) WHERE revoked_at IS NULL` remains available as belt-and-suspenders for a future migration.)

## Residual risks (accepted / documented)

- Token in browser history (URL-link design) — mitigated as above.
- Rate limiter **fails open** on a Redis outage (consistent with all existing limiters) — availability over strictness; the token secret + atomic max-use remain the primary controls.
- Live end-to-end exploitation testing requires a deployed stack (PostgreSQL/Redis); this review is code-level + unit-test backed (no live environment here).

## Recommendation

**Security PASS.** The portal is built secure-by-construction; both raised findings are fixed. Safe for a controlled pilot, with the deployment note to also set a `Referrer-Policy: no-referrer` response header at the hosting/CDN layer and to provision a strong, dedicated `CUSTOMER_TOKEN_HASH_KEY`.
