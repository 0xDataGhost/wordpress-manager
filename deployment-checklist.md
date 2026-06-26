# Deployment Checklist — SaaS E-commerce Dashboard

Production deployment guide for the API, Dashboard, and WordPress Connector. Complete every **REQUIRED** item before the first pilot. Reference `environment-reference.md` for every variable.

---

## 0. Topology

```
React Dashboard (static) ──HTTPS──> Express API ──> PostgreSQL
                                          ├────────> Redis (cache + BullMQ)
                                          └──HTTPS──> WordPress Connector Plugin ──> WooCommerce
```

- **API** (`apps/api`) — Node 22+, stateless, horizontally scalable. Needs PostgreSQL + Redis.
- **Dashboard** (`apps/dashboard`) — static build (`dist/`), served by any CDN/static host.
- **Workers** (`apps/workers`) — placeholder in this MVP; sync/webhooks run inline in the API (documented deferral).
- **Connector** (`plugins/wordpress-connector`) — installed in the customer's WordPress.

---

## 1. Pre-Deploy — Secrets & Config (REQUIRED)

- [ ] **Generate all secrets** in the correct format: run **`npm run secrets:generate`** in `apps/api` and copy the lines you need into the environment. It uses a CSPRNG, prints copy/paste env lines, and **never writes `.env`**.
- [ ] **`CORS_ORIGIN`** set to the exact dashboard origin (comma-separated if several). ⚠️ The API now **refuses to boot in production if this is `*`**.
- [ ] **`JWT_ACCESS_SECRET`** and **`JWT_REFRESH_SECRET`** — fresh, unique, ≥32 chars each. **Never reuse dev/example values.**
- [ ] **`CONNECTOR_ENCRYPTION_KEY`** — AES-256 (64 hex / 32-byte base64). Required for product publish + WooCommerce pull sync. Unset → those paths return "not configured" (API still boots); a malformed value **fails fast at boot**. ⚠️ Rotating orphans every stored connector key.
- [ ] **`DIGITAL_CODE_ENCRYPTION_KEY`** and **`DIGITAL_CODE_HASH_KEY`** — required for digital code import/reveal. Encryption key is AES-256 (64 hex / 32-byte base64; malformed → fails fast at boot); hash key is a strong random secret. ⚠️ **Set once, up front — NEVER rotate after real codes are imported** (rotation makes codes undecryptable / breaks dedup).
- [ ] **`DATABASE_URL`** — points at the production PostgreSQL (TLS where available).
- [ ] **`REDIS_URL`** — production Redis (auth/TLS where available).
- [ ] **`NODE_ENV=production`**.
- [ ] **`OPENAI_API_KEY`** — set for live AI, or leave unset to use the deterministic mock provider (assistants still work).
- [ ] Confirm no real secret values are committed. `apps/api/.env` is git-ignored; verify with `git status`.
- [ ] Rotate any secret that ever lived in a dev `.env`.

## 2. Database (REQUIRED)

- [ ] Provision PostgreSQL 16 (matches `docker-compose.yml`).
- [ ] Apply all migrations through **`0011`**: `npm run db:migrate` (uses `DATABASE_URL`).
- [ ] Seed the RBAC catalog + system roles: `npm run db:seed` (idempotent).
- [ ] Verify migration `0011` created the 13 new indexes (`\di` in psql, or check `order_items_order_idx` exists).
- [ ] Confirm a non-superuser app role is used by the API (least privilege).

## 3. Redis (REQUIRED)

- [ ] Provision Redis 7 with persistence (`appendonly yes`).
- [ ] Confirm reachable from the API (`/health` shows `redis: up`).
- [ ] Note: Redis backs the dashboard cache (fail-open) and BullMQ queue registration.

## 4. API service (REQUIRED)

- [ ] `npm ci && npm run build` → run `node dist/index.js`.
- [ ] Startup logs show `PostgreSQL connection OK` + `Redis connection OK` (fail-fast on either).
- [ ] Run behind a TLS-terminating reverse proxy / load balancer.
- [ ] `trust proxy` is enabled (1 hop) — ensure exactly one proxy in front for correct client IPs in audit logs/rate limiting.
- [ ] Health checks wired:
  - **Liveness** → `GET /health/live` (fast, no deps).
  - **Readiness** → `GET /health` (returns **503** when DB/Redis/queue degraded — do not route traffic on 503).
- [ ] Graceful shutdown honored: orchestrator sends `SIGTERM`, allow ≥ `SHUTDOWN_TIMEOUT_MS` (default 10s) to drain.
- [ ] Auth rate limiting enabled (`AUTH_RATE_LIMIT_ENABLED=true`) — login/register/refresh.
- [ ] Confirm security headers present on a sample response: `Content-Security-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, no `X-Powered-By`.

## 5. Dashboard (REQUIRED)

- [ ] Set **`VITE_API_URL`** to the production API origin (the client appends `/api/v1`).
- [ ] `npm ci && npm run build` → deploy `dist/` to the static host/CDN.
- [ ] Confirm the build emits split chunks (`vendor-react`, `vendor-form`, per-page chunks) and **no >500KB chunk warning**.
- [ ] Serve over HTTPS; set long cache headers on hashed assets, no-cache on `index.html`.
- [ ] Verify `CORS_ORIGIN` on the API includes this exact origin.

## 6. WordPress Connector (per customer store)

- [ ] Install + activate `saas-connector` in the customer's WordPress.
- [ ] In the dashboard (Connection page, requires `settings.edit`), generate an API key — copy it once.
- [ ] Paste the key into the plugin settings; confirm connection status flips to connected.
- [ ] Verify both health checks: dashboard `/health` and plugin `GET /wp-json/saas/v1/health`.
- [ ] Confirm the WordPress site is reachable over **HTTPS** (signed requests carry sensitive data).
- [ ] Run a manual sync; confirm products/orders/customers appear and a re-sync creates no duplicates.

## 7. Backups & DR (REQUIRED)

- [ ] **PostgreSQL automated backups** — daily full + WAL/PITR. This DB is the source of truth for all tenant data.
- [ ] Test a restore into a scratch instance at least once.
- [ ] Document RPO/RTO targets for the pilot.
- [ ] Redis is rebuildable (cache + transient queues) — backups optional but persistence on is recommended.
- [ ] Store secrets in a managed secret store / orchestrator secrets — **never** baked into a container image layer.
- [ ] Retain audit logs (the `audit_logs` table) per your accountability policy; no automatic purge exists.

## 8. Observability

- [ ] Ship API stdout (pino JSON) to a log aggregator. Redaction covers auth headers, passwords, tokens, API keys, and connector cipher material.
- [ ] Alert on: readiness `/health` = 503, elevated 5xx, repeated `RATE_LIMITED` (429), and `Webhook failed` / sync-failed log lines.
- [ ] Monitor PostgreSQL connection-pool saturation (`DB_POOL_MAX`, default 10) — relevant during inline sync of larger stores.

## 9. Post-Deploy Smoke Test

- [ ] Register an owner → store auto-created, owner role assigned.
- [ ] Login / logout / token refresh.
- [ ] Protected routes redirect when unauthenticated.
- [ ] Permission gating: a Viewer sees no product write controls and no restricted nav links; an Owner sees everything.
- [ ] Connect a store, run a sync, view products/orders/customers/dashboard.
- [ ] Publish a dashboard product to WooCommerce (returns a WooCommerce product id).
- [ ] Trigger a low-stock automation → notification appears in the bell + notifications page.
- [ ] Confirm no cross-store data leakage with two test stores.
- [ ] No critical console errors in the browser.

## 10. Known Operational Notes (accepted for pilot)

- Manual sync + webhook processing run **synchronously inline** in the API request (MVP deferral). Fine at pilot volume; move to BullMQ workers before onboarding large catalogs.
- No self-service password reset yet — admins provision/rotate credentials manually.
- `drizzle-orm`/`tar` advisories are **not exploitable** in this codebase; schedule the upgrade in a maintenance window (see the readiness report).
