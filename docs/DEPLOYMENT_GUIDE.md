# Deployment Guide

Step-by-step instructions for the first production deployment. See `deployment-checklist.md` for the full ordered checklist and `PRODUCTION_ENVIRONMENT.md` for topology and variable reference.

---

## Pre-Deploy (Do Once Before Anything Else)

### 1. Generate All Secrets

```bash
cd apps/api
npm run secrets:generate
```

Copy the output into your secrets manager / CI secrets. **Never commit secrets to git.**

Rules:
- `DIGITAL_CODE_ENCRYPTION_KEY` and `DIGITAL_CODE_HASH_KEY` — set both together; never rotate after real codes are imported
- `CUSTOMER_TOKEN_HASH_KEY` — must not reuse `DIGITAL_CODE_HASH_KEY`
- `CONNECTOR_ENCRYPTION_KEY` — required for WooCommerce publish/sync
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — at least 32 chars each, distinct from each other

### 2. Provision Infrastructure

- PostgreSQL 16 database with a **non-superuser app role** (least privilege)
- Redis 7 with `appendonly yes` persistence
- A TLS-terminating reverse proxy / load balancer in front of the API

---

## Database Setup

```bash
# 1. Apply all 19 migrations (0000-0018)
DATABASE_URL=<your-prod-url> npm run db:migrate --prefix apps/api

# 2. Verify latest migration applied
psql $DATABASE_URL -c "\dt" | grep customer_access_tokens

# 3. Seed RBAC catalog (idempotent — safe to re-run)
DATABASE_URL=<your-prod-url> npm run db:seed --prefix apps/api
```

The seed step provisions all permission records and system roles added in Phases 20.5, 22, and 23. It is idempotent — running it multiple times is safe.

---

## Building the API

```bash
cd apps/api
npm ci
npm run build          # outputs to dist/
```

Start with:
```bash
NODE_ENV=production \
DATABASE_URL=... \
REDIS_URL=... \
JWT_ACCESS_SECRET=... \
JWT_REFRESH_SECRET=... \
CORS_ORIGIN=https://dashboard.example.com \
  node dist/index.js
```

Verify boot:
- Logs show `PostgreSQL connection OK` and `Redis connection OK`
- `GET /health` returns `{ "status": "ok" }`

---

## Building the Dashboard

```bash
cd apps/dashboard
VITE_API_URL=https://api.example.com npm run build
# Produces: dist/
```

Deploy `dist/` to any static host or CDN. Configure:
- Long-lived cache on `/assets/*` (hashed filenames)
- No-cache on `index.html`
- SPA fallback: all non-asset 404s → `index.html`
- `Referrer-Policy: no-referrer` header (required for customer portal token safety)

---

## WordPress Connector (Per Customer Store)

1. Upload and activate `plugins/wordpress-connector/saas-connector.zip` in the customer's WordPress admin.
2. In the SaaS dashboard (Connection page), generate an API key — it is shown **once**.
3. Paste the key into the plugin settings. The connection status should flip to **Connected**.
4. Run a manual sync to verify products, orders, and customers import correctly.

---

## Post-Deploy Smoke Test

Run through the checklist in `deployment-checklist.md` §9 in order:

1. Register owner → store auto-created
2. Login / token refresh / logout
3. Permission gating (Viewer vs Owner)
4. Connect a store, sync, view dashboard
5. Digital product smoke test (if keys configured)
6. Customer portal smoke test (if `CUSTOMER_TOKEN_HASH_KEY` configured)
7. Verify no cross-store data leakage
8. Confirm no console errors in browser

---

## Rolling Updates

The API is stateless. Zero-downtime deploys:

1. Deploy new API replicas alongside old ones (health check must pass before routing traffic)
2. Drain old replicas (`SIGTERM` → wait `SHUTDOWN_TIMEOUT_MS` → `SIGKILL`)
3. The dashboard is a static swap — update the CDN origin atomically

Database migrations **must run before** the new API version starts receiving traffic if the migration adds columns referenced by the new code. Migration 0018 only adds an index (no schema change) — it is safe to run while old replicas are live.

---

## Rollback

1. Revert the API container image to the previous version
2. Revert the dashboard static files to the previous build
3. Database rollbacks: not automated — assess case by case. Additive migrations (indexes, new tables) are generally safe to leave in place. If a migration added a column used by the old code, a compensating migration may be needed.
