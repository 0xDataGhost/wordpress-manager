# Troubleshooting Guide

Common issues encountered in production and their resolutions. For operational runbooks see `OPERATIONS_GUIDE.md`.

---

## API Issues

### API Won't Start

**Symptom:** Process exits immediately with `process.exit(1)`.

**Common causes:**

| Error in logs | Fix |
|--------------|-----|
| `Invalid environment variables: { DATABASE_URL: [...] }` | `DATABASE_URL` is missing or malformed |
| `Invalid environment variables: { JWT_ACCESS_SECRET: [...] }` | Secret is too short (< 32 chars) |
| `CORS_ORIGIN must be an explicit origin allowlist in production` | Set `CORS_ORIGIN` to your dashboard domain; wildcard `*` is blocked in production |
| `DIGITAL_CODE_ENCRYPTION_KEY and DIGITAL_CODE_HASH_KEY must both be set or both be unset` | You set one but not the other — set both or neither |
| `must decode to exactly 32 bytes` | `DIGITAL_CODE_ENCRYPTION_KEY` or `CONNECTOR_ENCRYPTION_KEY` is not 64 hex chars / 32-byte base64 |
| `PostgreSQL connection OK` missing | DB unreachable — check `DATABASE_URL` and network/firewall |
| `Redis connection OK` missing | Redis unreachable — check `REDIS_URL` |

---

### `GET /health` Returns 503

**Meaning:** The API is up but at least one dependency is degraded.

```bash
curl https://api.example.com/health | jq .
# { "status": "degraded", "checks": { "db": "ok", "redis": "error", "queue": "ok" } }
```

**Actions:**
- `db: error` → Check PostgreSQL connectivity; `DATABASE_URL`; pool limits (`DB_POOL_MAX`)
- `redis: error` → Check Redis connectivity; `REDIS_URL`; Redis memory/CPU
- `queue: error` → Usually follows a Redis outage; resolves when Redis recovers

Rate limiters, auth, and digital module all degrade gracefully when Redis is unavailable (fail-open for rate limiting; fail-closed for auth cache lookups).

---

### 500 Errors in Production

The API returns a generic "Internal server error" in production without stack traces (intentional). To diagnose:

1. Find the `requestId` from the client response header (`X-Request-Id`)
2. Search logs for that `requestId`
3. The structured log entry has `err.message` and optionally `err.stack` (visible in dev mode)

---

### 429 Too Many Requests

**Auth endpoints** (`/auth/login`, `/register`, `/refresh`): controlled by `AUTH_RATE_LIMIT_*` vars. Default: 10 requests per 15 minutes per IP.

**Digital reveal** (`POST /digital-inventory/codes/:id/reveal`): controlled by `DIGITAL_CODE_REVEAL_RATE_LIMIT_*`. Default: 20 reveals per 60 seconds per IP.

**Customer portal lookup/reveal**: controlled by `CUSTOMER_ACCESS_LOOKUP_RATE_LIMIT_*` and `CUSTOMER_ACCESS_REVEAL_RATE_LIMIT_*`.

To diagnose: search logs for `RATE_LIMITED`. To reset a specific bucket (e.g., during testing): delete the Redis key `rate:<name>:<identifier>`.

---

## Database Issues

### Migration Fails

```bash
npm run db:migrate --prefix apps/api
# Error: relation "..." already exists
```

The migration is trying to create something that already exists. This usually means a migration was partially applied.

**Steps:**
1. Check which migrations have been recorded: `SELECT version FROM drizzle_migrations ORDER BY version;`
2. If the migration's SQL partially ran but wasn't recorded, manually fix the state:
   - Drop the partially created objects
   - Re-run `db:migrate`
   - Or manually insert the migration version after verifying the schema is correct

**Migration 0018 note:** This migration uses `CREATE INDEX CONCURRENTLY`. This cannot run inside a transaction block. If your migration runner wraps each migration in a transaction, run this SQL manually and then mark it applied.

---

### Slow Queries

Most common causes:

- **Missing tenant scope**: ensure all queries include `WHERE store_id = $1` — all service functions should do this by design
- **Large `audit_logs` table**: add an index on `(store_id, created_at)` if not present; archive old rows
- **`orders` without date filter**: profit-report queries should filter by `placed_at` range — the `code_assignments_store_assigned_at_idx` index (added in 0018) helps here

Enable `pg_stat_statements` on your PostgreSQL instance for query-level analysis:
```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20;
```

---

## Digital Code Issues

### Import Returns "Feature not configured"

`DIGITAL_CODE_ENCRYPTION_KEY` and/or `DIGITAL_CODE_HASH_KEY` are not set. Both must be present together.

### "Duplicate code detected" During Import

The batch contains a code whose HMAC fingerprint already exists in this store's inventory. This is the deduplication guard working correctly — the duplicate is silently skipped. Check the import summary for `duplicates` count.

### Reveal Returns "Code not found" or 404

- The `code_id` may belong to a different store (tenant isolation)
- The code may have been marked `invalid` or `expired`
- Check `digital_codes` table: `SELECT status, store_id FROM digital_codes WHERE id = '<uuid>';`

### Customer Link Returns Generic Rejection

All invalid/expired/overused token lookups return the same generic rejection to prevent enumeration. To diagnose server-side:

```sql
SELECT status, expires_at, used_count, max_uses, revoked_at
FROM customer_access_tokens
WHERE token_hash = hmac('<raw-token>', '<CUSTOMER_TOKEN_HASH_KEY>', 'sha256')::text;
```

---

## Frontend Issues

### Dashboard Shows Blank Page After Deploy

Usually a stale `index.html` cached by the CDN or browser.

- Ensure `index.html` is served with `Cache-Control: no-cache, no-store`
- Hard-reload (Cmd+Shift+R / Ctrl+Shift+R) in the browser

### API Calls Return 401 After Token Refresh

The refresh token may have been invalidated (reuse detection). The user must log in again. This is by design — if a refresh token is used twice, all sessions for that user are revoked as a security measure.

### CORS Errors in Browser Console

`CORS_ORIGIN` on the API does not include the dashboard origin. Add the dashboard URL to `CORS_ORIGIN` (comma-separated if multiple origins).

---

## WordPress Connector Issues

### Connection Status Shows "Not Connected"

- The API key may have been revoked — generate a new one from Connection page
- The WordPress site may not be reachable over HTTPS — verify the site URL
- The SaaS API URL in the plugin settings must match your production API origin exactly (including trailing slash or lack thereof)

### Sync Creates Duplicate Products/Orders

The sync uses WooCommerce IDs as the deduplication key. Duplicates indicate the WordPress `site_url` changed between syncs, causing a different `storeId` scope. Check `stores.woo_url` against the actual WordPress site URL.
