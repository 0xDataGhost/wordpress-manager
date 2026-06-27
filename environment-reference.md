# Environment Reference

Authoritative list of every environment variable, derived from the validated schema in `apps/api/src/config/env.ts` and the dashboard client. All API variables are validated by Zod at startup — an invalid or missing **required** value causes a **fail-fast exit** before the server listens.

Legend: **Required** = boot fails if missing · **Optional** = has a safe default · type/bounds enforced by Zod.

---

## API (`apps/api`)

### Application

| Variable | Req | Default | Bounds / Notes |
|---|---|---|---|
| `NODE_ENV` | Optional | `development` | `development` \| `test` \| `production` |
| `PORT` | Optional | `4000` | positive int |
| `HOST` | Optional | `0.0.0.0` | non-empty |
| `API_PREFIX` | Optional | `/api/v1` | must start with `/`. `/health` is always at root |
| `LOG_LEVEL` | Optional | `info` | `fatal\|error\|warn\|info\|debug\|trace\|silent` |

### CORS

| Variable | Req | Default | Bounds / Notes |
|---|---|---|---|
| `CORS_ORIGIN` | Optional | `*` | Comma-separated allowlist, or `*`. ⚠️ **In `production`, `*` is rejected at startup** (wildcard + credentials is unsafe). Set the explicit dashboard origin(s). |

### PostgreSQL

| Variable | Req | Default | Bounds / Notes |
|---|---|---|---|
| `DATABASE_URL` | **Required** | — | `postgresql://…` connection string |
| `DB_POOL_MAX` | Optional | `10` | positive int — max pool connections |
| `DB_CONNECTION_TIMEOUT_MS` | Optional | `10000` | positive int — acquire timeout |
| `DB_IDLE_TIMEOUT_MS` | Optional | `30000` | ≥0 — idle release (0 disables) |

### Redis (shared by cache + BullMQ)

| Variable | Req | Default | Bounds / Notes |
|---|---|---|---|
| `REDIS_URL` | **Required** | — | `redis://…` connection string |

### Authentication

| Variable | Req | Default | Bounds / Notes |
|---|---|---|---|
| `BCRYPT_ROUNDS` | Optional | `12` | int 10–15 |
| `JWT_ACCESS_SECRET` | **Required** | — | ≥32 chars. `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | **Required** | — | ≥32 chars, distinct from access. `openssl rand -hex 32` |
| `JWT_ACCESS_EXPIRES_IN` | Optional | `15m` | non-empty (e.g. `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | Optional | `7d` | non-empty (e.g. `7d`) |

### Auth rate limiting (Redis fixed-window, fail-open)

| Variable | Req | Default | Bounds / Notes |
|---|---|---|---|
| `AUTH_RATE_LIMIT_ENABLED` | Optional | `true` | `true` \| `false` — applies to login/register/refresh |
| `AUTH_RATE_LIMIT_WINDOW_SECONDS` | Optional | `900` | positive int |
| `AUTH_RATE_LIMIT_MAX` | Optional | `10` | positive int — requests per window before 429 |

### WooCommerce sync & outbound delivery

| Variable | Req | Default | Bounds / Notes |
|---|---|---|---|
| `CONNECTOR_ENCRYPTION_KEY` | Optional* | — | 32 bytes (64 hex or base64). Encrypts the connector key at rest so the SaaS can sign outbound calls. **Required for product publish + pull sync**; when unset those paths return a clear "not configured" error (API still boots). |
| `WP_HTTP_TIMEOUT_MS` | Optional | `20000` | positive int — outbound HTTP timeout |
| `SYNC_PAGE_SIZE` | Optional | `50` | int 1–100 — WooCommerce page size |
| `SYNC_MAX_PAGES` | Optional | `200` | int 1–1000 — per-entity page cap (loop safety) |

\* Functionally required for any store that uses publish/sync.

### Dashboard analytics

| Variable | Req | Default | Bounds / Notes |
|---|---|---|---|
| `DASHBOARD_CACHE_TTL_SECONDS` | Optional | `300` | int 0–3600 — Redis read-through TTL (0 disables) |
| `DASHBOARD_LOW_STOCK_THRESHOLD` | Optional | `5` | int 0–100000 — active product is low-stock when `stock ≤` this |

### AI assistants (Phase 12.5)

| Variable | Req | Default | Bounds / Notes |
|---|---|---|---|
| `OPENAI_API_KEY` | Optional | — | When **unset**, a deterministic mock provider is used (assistants work offline). Set to enable live generation — no code change needed. |
| `OPENAI_MODEL` | Optional | `gpt-4o-mini` | non-empty |
| `OPENAI_BASE_URL` | Optional | `https://api.openai.com/v1` | valid URL |
| `AI_REQUEST_TIMEOUT_MS` | Optional | `30000` | positive int — AI call timeout |

### Digital code inventory (Phase 16)

Digital codes are encrypted at rest (AES-256-GCM) and de-duplicated via a keyed HMAC-SHA256 fingerprint. Both keys live only in the environment, never in the database. Generate all secrets with `npm run secrets:generate`.

| Variable | Req | Default | Bounds / Notes |
|---|---|---|---|
| `DIGITAL_CODE_ENCRYPTION_KEY` | Optional* | — | **AES-256 — must decode to 32 bytes (64 hex chars or base64).** A PRESENT but malformed value fails fast at boot; blank/unset disables the digital module (import/reveal return "not configured"). ⚠️ **Never rotate after real codes are imported** — stored ciphertext becomes permanently undecryptable. |
| `DIGITAL_CODE_HASH_KEY` | Optional* | — | Strong random secret, used **verbatim** as the HMAC key (no fixed format; only non-emptiness enforced). ⚠️ **Never rotate after real codes exist** — it breaks duplicate detection. |
| `DIGITAL_CODE_IMPORT_MAX_CODES` | Optional | `5000` | int 1–100000 — max codes per import request |
| `DIGITAL_CODE_REVEAL_RATE_LIMIT_ENABLED` | Optional | `true` | `true` \| `false` — per-IP limiter on the code-reveal endpoint |
| `DIGITAL_CODE_REVEAL_RATE_LIMIT_WINDOW_SECONDS` | Optional | `60` | positive int |
| `DIGITAL_CODE_REVEAL_RATE_LIMIT_MAX` | Optional | `20` | positive int — reveals per window before 429 |

\* Functionally required (both) to use digital fulfillment; the API still boots without them.

### Customer self-service portal (Phase 22)

Customers view their delivered codes through a short-lived signed link. All tokens are stored as HMAC fingerprints — the raw token is shown once and never stored.

| Variable | Req | Default | Bounds / Notes |
|---|---|---|---|
| `CUSTOMER_TOKEN_HASH_KEY` | Optional* | — | Dedicated HMAC secret for customer token fingerprints. **MUST NOT reuse `DIGITAL_CODE_HASH_KEY`.** Only non-emptiness enforced; use a strong random value (`npm run secrets:generate`). Unset → customer link generation returns "not configured". |
| `CUSTOMER_LINK_DEFAULT_TTL_DAYS` | Optional | `7` | int 1–365 — default link lifetime |
| `CUSTOMER_LINK_MAX_TTL_DAYS` | Optional | `30` | int 1–365 — hard max; requests can never exceed this |
| `CUSTOMER_LINK_DEFAULT_MAX_USES` | Optional | `1` | int 1–10000 — default max code reveals per link (1 = single-use) |
| `PUBLIC_APP_URL` | Optional | — | Full URL used to compose the customer link (e.g. `https://dashboard.example.com`). When unset, the dashboard uses its own origin. |
| `CUSTOMER_ACCESS_LOOKUP_RATE_LIMIT_ENABLED` | Optional | `true` | `true` \| `false` |
| `CUSTOMER_ACCESS_LOOKUP_RATE_LIMIT_WINDOW_SECONDS` | Optional | `60` | positive int |
| `CUSTOMER_ACCESS_LOOKUP_RATE_LIMIT_MAX` | Optional | `30` | positive int — lookup requests per window before 429 |
| `CUSTOMER_ACCESS_REVEAL_RATE_LIMIT_ENABLED` | Optional | `true` | `true` \| `false` — applies both per-IP and per-token |
| `CUSTOMER_ACCESS_REVEAL_RATE_LIMIT_WINDOW_SECONDS` | Optional | `60` | positive int |
| `CUSTOMER_ACCESS_REVEAL_RATE_LIMIT_MAX` | Optional | `10` | positive int — reveals per window (per-IP and per-token, independent buckets) |

\* Functionally required to use the customer self-service portal; the API still boots without it.

### Graceful shutdown

| Variable | Req | Default | Bounds / Notes |
|---|---|---|---|
| `SHUTDOWN_TIMEOUT_MS` | Optional | `10000` | positive int — drain window on SIGTERM/SIGINT before forced exit |

---

## Dashboard (`apps/dashboard`)

| Variable | Req | Default | Bounds / Notes |
|---|---|---|---|
| `VITE_API_URL` | Optional | `http://localhost:4000` | API origin; the client appends `/api/v1`. **Set to the production API origin** and ensure it is in the API's `CORS_ORIGIN`. Baked in at build time. |

---

## WordPress Connector (`plugins/wordpress-connector`)

No environment variables. Configured at runtime via the plugin admin page:

- **SaaS API URL** — the dashboard API origin.
- **API Key** — generated in the dashboard (Connection page, `settings.edit`) and pasted in. Stored in `wp_options` (plaintext — a WordPress structural limitation; rotate from the dashboard if the WP DB is exposed).

---

## Minimum required for production boot

```bash
NODE_ENV=production
CORS_ORIGIN=https://dashboard.example.com      # NOT "*" — boot fails otherwise
DATABASE_URL=postgresql://app:***@db:5432/saas_dashboard
REDIS_URL=redis://redis:6379
JWT_ACCESS_SECRET=<64-hex>
JWT_REFRESH_SECRET=<64-hex>
CONNECTOR_ENCRYPTION_KEY=<64-hex>         # required for publish/sync
DIGITAL_CODE_ENCRYPTION_KEY=<64-hex>      # required for digital code import/reveal
DIGITAL_CODE_HASH_KEY=<strong-random>     # required for digital code import/reveal
CUSTOMER_TOKEN_HASH_KEY=<strong-random>   # required for customer self-service portal
# Dashboard build:
VITE_API_URL=https://api.example.com
```

Generate every secret in the correct format with **`npm run secrets:generate`** (run in `apps/api`; prints copy/paste env lines, never writes `.env`). The two `*_ENCRYPTION_KEY` values must decode to exactly 32 bytes — a malformed value fails fast at boot. ⚠️ `DIGITAL_CODE_ENCRYPTION_KEY` / `DIGITAL_CODE_HASH_KEY` / `CONNECTOR_ENCRYPTION_KEY` must be set **once, up front** and never rotated after real data exists. See `deployment-checklist.md` for the full deploy sequence.
