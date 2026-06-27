# Release Candidate Report — v1.0.0-rc.1

**Date:** 2026-06-28
**RC Tag:** v1.0.0-rc.1
**Status:** APPROVED

---

## RC Gate Criteria

| Check | Result |
|-------|--------|
| API Typecheck | PASS — 0 errors |
| API Lint | PASS — 0 warnings |
| API Tests | PASS — 332/332 |
| Dashboard Typecheck | PASS — 0 errors |
| Dashboard Lint | PASS — 0 warnings |
| Dashboard Build | PASS — clean, no chunk > 500 KB |
| Security Audit | PASS — 0 CRITICAL, 0 HIGH |
| Performance Audit | PASS — all fixes applied |
| Reliability Audit | PASS — 0 CRITICAL, 0 HIGH |
| Documentation | COMPLETE |
| **RC Approved** | YES |

---

## What's in This RC

### Phases Completed (15–23)

| Phase | Feature |
|-------|---------|
| 15 | Supplier management (CRUD, product linking, batch tracking) |
| 16 | Digital code inventory (AES-256-GCM encryption, HMAC dedup, import) |
| 17 | Digital delivery engine (FOR UPDATE SKIP LOCKED, four pool strategies) |
| 18 | Delivery tracking (webhook-triggered, delivery records, notifications) |
| 19 | Support tools (manual assign, replacement, refund, code release) |
| 20 | Digital reports (inventory, delivery, suppliers, profit, stock alerts) |
| 20.5 | RBAC: digital-module permissions, role restrictions |
| 20.6 | Profit analytics refinements |
| 21 | Digital automations (low-stock, replacement-rate, delivery-rate triggers) |
| 22 | Customer self-service portal (HMAC-signed links, secure reveal, rate limiting) |
| 23 | Digital automation enhancements, notification improvements |
| 24 | Production hardening (this phase) |

### Phase 24 Fixes Applied

| Fix | Impact |
|-----|--------|
| DB index on `code_assignments (store_id, assigned_at)` | Eliminates table-scan for automation + profit-report queries |
| Debounced search (300 ms) in list pages | Eliminates per-keystroke API calls and double-fetch |
| Pino redaction extended: `*.code`, `*.codeHash`, `*.tokenHash` | Defense-in-depth for log safety |
| `stores.controller` throw NotFoundError consistently | Code consistency |
| `lib/paginate` shared utility | Eliminates duplicate helper in 2 controllers |
| Digital key pair boot-time guard in `env.ts` | Fail-fast if encryption key set without hash key |
| Documentation: 6 new operational docs | PRODUCTION_ENVIRONMENT, DEPLOYMENT_GUIDE, OPERATIONS_GUIDE, BACKUP_AND_RESTORE, TROUBLESHOOTING, RELEASE_CHECKLIST |
| `deployment-checklist.md` + `environment-reference.md` updated | Accurate pre-deploy references |

---

## Known Limitations (Accepted for v1.0 Pilot)

These are documented in `docs/OPERATIONS_GUIDE.md` and do not block the RC:

1. **WooCommerce sync is inline** (not background workers) — fine at pilot volume; BullMQ is the documented next step
2. **No self-service password reset** — admins provision credentials for pilot
3. **Webhook endpoints lack independent rate limiting** — connector key auth provides primary protection
4. **No trigram indexes for ILIKE search** — low search volume at pilot; add `pg_trgm` extension post-pilot
5. **`drizzle-orm`/`tar` advisory notices** — not exploitable in this codebase; schedule upgrade in a maintenance window

---

## Deployment Requirements

Before deploying this RC to production, complete all items in `deployment-checklist.md`:

- Apply all 19 migrations (0000–0018) — `npm run db:migrate`
- Run `npm run db:seed` (provisions Phase 20.5/22/23 permissions)
- Set `DIGITAL_CODE_ENCRYPTION_KEY` and `DIGITAL_CODE_HASH_KEY` together (or neither)
- Set `CUSTOMER_TOKEN_HASH_KEY` (must not reuse `DIGITAL_CODE_HASH_KEY`)
- Set `CORS_ORIGIN` to the exact dashboard origin (not `*`)
- Complete all items in §9 Post-Deploy Smoke Test

Refer to `docs/DEPLOYMENT_GUIDE.md` for the full step-by-step deploy sequence.

---

## Certification

All Phase 24 production readiness criteria met as documented in `production-readiness-report.md`. The codebase is suitable for a controlled pilot deployment with the limitations noted above.
