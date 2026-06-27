# Release Checklist

Pre-release gate checklist. All items must be green before tagging a release candidate or deploying to production.

---

## Code Quality

- [ ] `npm run typecheck` — zero errors (apps/api)
- [ ] `npm run lint` — zero errors (apps/api)
- [ ] `npm test` — all tests pass (332/332 or better)
- [ ] `npm run typecheck` — zero errors (apps/dashboard)
- [ ] `npm run lint` — zero errors (apps/dashboard)
- [ ] `npm run build` — clean build, no chunk > 500 KB (apps/dashboard)

---

## Security

- [ ] No hardcoded secrets in source (`git grep -r "sk-\|password\s*=\s*['\"]" apps/`)
- [ ] `.env` is git-ignored; confirm with `git status`
- [ ] All 19 migrations (0000–0018) applied on production DB
- [ ] `DIGITAL_CODE_ENCRYPTION_KEY` and `DIGITAL_CODE_HASH_KEY` both set in production
- [ ] `CUSTOMER_TOKEN_HASH_KEY` set and distinct from `DIGITAL_CODE_HASH_KEY`
- [ ] `CORS_ORIGIN` set to explicit dashboard origin (not `*`)
- [ ] Security headers present on a sample API response (see `PRODUCTION_ENVIRONMENT.md`)

---

## Database

- [ ] All migrations applied: latest is `0018_code_assignments_assigned_at_idx`
- [ ] `npm run db:seed` run (idempotent; provisions new Phase 20.5/22/23 permissions)
- [ ] Automated backups configured; restore tested at least once

---

## Environment

- [ ] All required variables set (see `environment-reference.md` minimum production boot section)
- [ ] `NODE_ENV=production`
- [ ] `VITE_API_URL` baked into dashboard build with correct production API origin

---

## Smoke Test

- [ ] Owner registration + store auto-created
- [ ] Login / token refresh / logout
- [ ] Permission gating verified (Viewer vs Owner)
- [ ] Store connected + manual sync runs without errors
- [ ] Digital product: import codes → assign → reveal → audit log written
- [ ] Customer portal: generate link → access codes → link expiry enforced
- [ ] `GET /health` returns `{ status: "ok" }` (not 503)
- [ ] No critical browser console errors

---

## Documentation

- [ ] `docs/status.md` reflects current phase completion
- [ ] `environment-reference.md` up to date with all variables
- [ ] `deployment-checklist.md` migration reference matches latest migration
- [ ] `PRODUCTION_ENVIRONMENT.md` reviewed
- [ ] `DEPLOYMENT_GUIDE.md` reviewed
- [ ] `OPERATIONS_GUIDE.md` reviewed

---

## Sign-Off

| Check | Status | Notes |
|-------|--------|-------|
| API typecheck | | |
| API lint | | |
| API tests (332/332) | | |
| Dashboard typecheck | | |
| Dashboard lint | | |
| Dashboard build | | |
| Security audit | | |
| Performance audit | | |
| Smoke test | | |
| Documentation complete | | |
| **RC Approved** | | |
