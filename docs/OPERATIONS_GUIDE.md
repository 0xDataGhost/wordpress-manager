# Operations Guide

Day-to-day operational reference for the production SaaS dashboard. Covers monitoring, common tasks, runbooks for known scenarios, and accepted MVP limitations.

---

## Health Monitoring

| Endpoint | Check | Alert on |
|----------|-------|---------|
| `GET /health` | DB + Redis + queue | status ≠ `ok` or HTTP 503 |
| `GET /health/live` | Process alive | Any non-200 |

Suggested alert thresholds:
- `GET /health` returns 503 for > 30 seconds → page on-call
- HTTP 5xx rate > 1% over 5 minutes → alert
- HTTP 429 (`RATE_LIMITED`) spike > 10/min → investigate
- Pino log line `"Webhook failed"` → alert (sync is broken for that store)

---

## Log Aggregation

The API emits structured JSON (pino) to stdout. Ship it to your log aggregator (e.g., CloudWatch, Datadog, Loki).

Key log fields:

| Field | Meaning |
|-------|---------|
| `level` | `info` / `warn` / `error` / `fatal` |
| `req.method`, `req.url` | Request identity |
| `res.statusCode` | Response status |
| `responseTime` | Duration in ms |
| `storeId` | Tenant — add to your search facets |
| `userId` | Acting user (authenticated requests) |
| `err.message` | Error details (stack traces in dev only) |

Redacted fields (appear as `[REDACTED]`): `authorization`, `cookie`, `password`, `token`, `apiKey`, `secret`, `codeHash`, `tokenHash`, `code`, connector cipher material.

---

## Common Operational Tasks

### Reset a User's Password

No self-service password reset is implemented (accepted for pilot). An admin must:

1. Log in as an owner-role user
2. Go to Team → find the user → use "Set Password" (if implemented) or provision a temporary credential through the API

### Revoke a WordPress Connector API Key

1. Dashboard → Connection → Disconnect
2. Or call `POST /api/v1/stores/current/disconnect` with a valid JWT
3. Generate a new key via `POST /api/v1/stores/current/api-key`

### Trigger a Manual WooCommerce Sync

1. Dashboard → Connection → Sync Now
2. Or `POST /api/v1/sync` — requires `sync.run` permission

### Regenerate a Customer Access Link

1. Dashboard → Order → Digital Codes → Generate Customer Link
2. The previous link is automatically revoked when a new one is created for the same order (one active link per order enforced by advisory lock)

### Revoke All Sessions for a User (Security Incident)

Not exposed via dashboard UI — requires direct DB intervention:

```sql
UPDATE refresh_tokens
SET revoked_at = NOW(), revoked_reason = 'security_incident'
WHERE user_id = '<uuid>'
  AND revoked_at IS NULL;
```

---

## Runbooks

### Runbook: Digital Code Import Fails with "not configured"

**Cause:** `DIGITAL_CODE_ENCRYPTION_KEY` or `DIGITAL_CODE_HASH_KEY` (or both) are missing or malformed.

**Action:**
1. Check API startup logs for `Invalid configuration:` errors
2. Verify both vars are set and `DIGITAL_CODE_ENCRYPTION_KEY` decodes to 32 bytes: `echo -n "$DIGITAL_CODE_ENCRYPTION_KEY" | xxd | head`
3. Restart the API after fixing

### Runbook: Customer Portal Link Returns "Link not found or expired"

**Cause (likely):** Link has expired, been revoked, or max uses reached.

**Action (staff):**
1. Go to Order → Digital Codes → generate a new customer link with an appropriate TTL

**Cause (unlikely):** `CUSTOMER_TOKEN_HASH_KEY` was rotated — all existing links became invalid.

**Action:** Rotate cannot be undone. Generate fresh links for affected orders.

### Runbook: Webhook Deliveries Failing

**Symptoms:** Pino log `"Webhook failed"`, order sync is stale.

**Steps:**
1. Check `webhook_events` table for recent `failed` rows: error message is stored in `error`
2. Verify the WordPress site is reachable over HTTPS from the API
3. Check the connector plugin is active and the API key hasn't been revoked
4. Re-run sync manually from the dashboard Connection page

### Runbook: Codes Not Assigned After Order Sync

**Symptoms:** Order `digital_delivery_status = pending_assignment` but no codes assigned.

**Steps:**
1. Check `code_assignments` for any rows with this `order_id`
2. Check `digital_codes` for `status = 'available'` and matching product — if count is 0, the inventory is depleted
3. Check `notifications` table for a shortfall notification
4. Import more codes and re-trigger assignment: `PATCH /api/v1/digital-delivery/orders/:orderId/assign` (requires `digital_delivery.manage`)

### Runbook: Database Connection Pool Exhausted

**Symptoms:** API slow, logs show `DB pool timeout`, health check degraded.

**Steps:**
1. Check `DB_POOL_MAX` (default 10) — increase if load has grown
2. Check for long-running queries in PostgreSQL: `SELECT pid, now()-query_start AS duration, query FROM pg_stat_activity WHERE state='active' ORDER BY duration DESC LIMIT 10;`
3. Consider moving WooCommerce sync to background BullMQ workers (see accepted limitations)

---

## Accepted MVP Limitations (Pilot)

The following are known gaps accepted for the pilot and should be addressed before scaling:

| Limitation | Impact | Path Forward |
|-----------|--------|-------------|
| WooCommerce sync runs inline (synchronous, in the request thread) | Large catalogs (>1000 products) can time out or saturate the DB pool | Move sync to BullMQ workers |
| No self-service password reset | Admins must provision credentials manually | Add forgot-password email flow |
| Advisory notes only, no `drizzle-orm` / `tar` upgrade | No active exploitability in this codebase | Schedule upgrade in a maintenance window |
| No per-route body-size limit on `/digital-inventory/import` | 1 MB global limit already applies; tighter guard would add defense in depth | Add per-route `express.json({ limit: '500kb' })` |
| Webhook endpoints lack independent rate limiting | Connector key auth is the primary guard | Add per-IP + per-key throttle before scaling to many stores |

---

## Database Maintenance

```sql
-- Check table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(oid))
FROM pg_class WHERE relkind = 'r' ORDER BY pg_total_relation_size(oid) DESC LIMIT 20;

-- Check index usage (indexes with 0 scans can be dropped)
SELECT indexrelname, idx_scan FROM pg_stat_user_indexes ORDER BY idx_scan ASC;

-- Check long-running queries
SELECT pid, now()-query_start AS duration, query
FROM pg_stat_activity WHERE state='active'
ORDER BY duration DESC LIMIT 10;
```

The `audit_logs` table grows indefinitely — no automatic purge. Establish a retention policy (e.g., archive rows older than 90 days) before production data accumulates significantly.
