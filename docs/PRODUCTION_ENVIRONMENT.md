# Production Environment Reference

Complete guide to provisioning and configuring the production environment. See `environment-reference.md` for the authoritative variable list and `deployment-checklist.md` for the ordered deploy sequence.

---

## Stack Requirements

| Component | Minimum Version | Notes |
|-----------|----------------|-------|
| Node.js | 22 LTS | Stateless; horizontally scalable |
| PostgreSQL | 16 | Source of truth for all tenant data |
| Redis | 7 | Cache + BullMQ job registration |

---

## Topology

```
React Dashboard (CDN/static host)
        │ HTTPS
        ▼
Express API (Node 22, stateless)
        ├── PostgreSQL 16
        ├── Redis 7
        └── HTTPS → WordPress Connector Plugin → WooCommerce
```

- The API is the only stateful service. It can be scaled horizontally (multiple replicas share the same DB + Redis).
- The dashboard is a static build (`apps/dashboard/dist/`) that can be served from any CDN.
- The WordPress connector plugin lives inside each customer's WordPress installation and calls back to the API.

---

## Required Environment Variables (Production Minimum)

```bash
NODE_ENV=production
CORS_ORIGIN=https://dashboard.example.com      # NOT "*" — API refuses to boot
DATABASE_URL=postgresql://app:***@db:5432/saas_dashboard
REDIS_URL=redis://redis:6379
JWT_ACCESS_SECRET=<64-hex>       # openssl rand -hex 32
JWT_REFRESH_SECRET=<64-hex>      # distinct from access secret
CONNECTOR_ENCRYPTION_KEY=<64-hex>              # for publish + WooCommerce sync
DIGITAL_CODE_ENCRYPTION_KEY=<64-hex>           # for digital code import/reveal
DIGITAL_CODE_HASH_KEY=<strong-random>          # must be set together with ENCRYPTION_KEY
CUSTOMER_TOKEN_HASH_KEY=<strong-random>        # for customer self-service portal
VITE_API_URL=https://api.example.com           # baked into dashboard at build time
```

Generate all secrets: `npm run secrets:generate` (in `apps/api`). Prints ready-to-paste env lines, never writes files.

> **Critical rotation rules:**
> - `DIGITAL_CODE_ENCRYPTION_KEY` — set once; rotating makes all stored codes undecryptable
> - `DIGITAL_CODE_HASH_KEY` — set once; rotating breaks duplicate detection
> - `CONNECTOR_ENCRYPTION_KEY` — rotating orphans all stored connector API keys
> - `CUSTOMER_TOKEN_HASH_KEY` — rotating invalidates all active customer links

---

## Port Map

| Service | Default Port | Override |
|---------|-------------|---------|
| API | 4000 | `PORT` |
| Dashboard (static) | CDN / 80+443 | — |
| PostgreSQL | 5432 | in `DATABASE_URL` |
| Redis | 6379 | in `REDIS_URL` |

---

## Reverse Proxy Requirements

- **TLS termination** must happen at the proxy layer (the API itself serves plain HTTP internally).
- **`trust proxy 1`** is already enabled in the API — ensure exactly **one** proxy hop is in front so `req.ip` is accurate for audit logs and rate limiting.
- Pass `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Host` from the proxy.

---

## Security Headers (API Response)

Helmet is applied globally. Verify the following headers are present on a production response:

```
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
Strict-Transport-Security: max-age=15552000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Permissions-Policy: camera=(), microphone=(), geolocation=()
Referrer-Policy: no-referrer
```

`X-Powered-By` is removed.

---

## Static Dashboard Hosting

The dashboard build (`dist/`) must be served with:

- **Long-lived cache headers** on hashed assets (`/assets/*`): `Cache-Control: public, max-age=31536000, immutable`
- **No-cache on `index.html`**: `Cache-Control: no-cache, no-store`
- **SPA fallback**: all non-asset paths should serve `index.html` (React Router handles routing client-side)
- **`Referrer-Policy: no-referrer`** — important for the customer portal page (`/digital-order/:token`) to prevent token leakage via the `Referer` header to any third-party resources

---

## Health Check Endpoints

| Endpoint | Purpose | Expected |
|----------|---------|----------|
| `GET /health/live` | Liveness — fast, no deps | 200 always while process is up |
| `GET /health` | Readiness — checks DB + Redis + queue | 200 = healthy; 503 = degraded |

Configure your load balancer to:
- Use `GET /health` as the **readiness** probe (stop routing when 503)
- Use `GET /health/live` as the **liveness** probe (restart only when process is down)

---

## Graceful Shutdown

The API responds to `SIGTERM` by stopping new connections and draining in-flight requests. Allow at least `SHUTDOWN_TIMEOUT_MS` (default 10 000 ms) between sending `SIGTERM` and `SIGKILL`.
