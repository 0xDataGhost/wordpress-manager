# API (Express) — Phase 3: Auth, Multi-Tenancy & RBAC

Production-ready Express + TypeScript backend for the SaaS E-commerce
Operations Dashboard. Building on the Phase 2 foundation (config,
database/cache/queue connectivity, validation, error handling, logging, health),
Phase 3 adds the multi-tenant core: user authentication, the store (tenant)
ownership model, and a permission-based roles & permissions system.

## Tech Stack

- **Express.js** (v4) + **TypeScript** (CommonJS build)
- **PostgreSQL** via **Drizzle ORM** + `pg` (migrations through `drizzle-kit`)
- **Redis** via `ioredis`
- **BullMQ** for background jobs (infrastructure only; no jobs yet)
- **Zod** for environment + request validation
- **Pino** / `pino-http` for structured logging
- `helmet`, `cors`, `compression` for hardening
- **bcrypt** for password hashing, **jsonwebtoken** for JWT access/refresh tokens

## Folder Structure

```txt
apps/api/
  src/
    config/
      env.ts                 # Zod-validated, typed environment config
      rbac.ts                # RBAC catalog: permission keys + system roles
    lib/
      api-response.ts        # success/error response envelopes
      async-handler.ts       # async route wrapper
      errors.ts              # AppError hierarchy + error codes
      logger.ts              # Pino logger
      password.ts            # bcrypt hash/verify
      jwt.ts                 # sign/verify access & refresh tokens
    middleware/
      authenticate.ts        # Bearer access-token guard (sets req.auth)
      authorize.ts           # requirePermission / requireRole guards
      error-handler.ts       # centralized error formatting
      not-found.ts           # 404 handler
      request-logger.ts      # pino-http + request id
      validate.ts            # Zod request validation factory
    db/
      index.ts               # pg Pool + Drizzle client + health probe
      migrate.ts             # migration runner (npm run db:migrate)
      seed.ts                # seeds permissions + system roles (npm run db:seed)
      schema/                # users, stores, store-users, roles, permissions,
                             #   role-permissions, user-roles, refresh-tokens
    redis/
      index.ts               # general-purpose Redis client + probe
    queue/
      connection.ts          # dedicated BullMQ Redis connection + probe
      index.ts               # queue factory/registry
    modules/
      health/                # health.routes / .controller / .service
      auth/                  # register/login/logout/refresh/me + token service
      stores/                # create store / current store
      roles/                 # list roles
    types/
      express.d.ts           # Request augmentation (req.auth)
    routes/
      index.ts               # versioned API root router (API_PREFIX)
    app.ts                   # Express app factory
    index.ts                 # bootstrap: startup checks + graceful shutdown
  drizzle/                   # generated SQL migrations
  drizzle.config.ts
  docker-compose.yml         # local PostgreSQL + Redis
  .env.example
```

## Endpoints

System (mounted at root):

| Method | Path             | Description                                   |
| ------ | ---------------- | --------------------------------------------- |
| GET    | `/health`        | Readiness: PostgreSQL + Redis + queue (200/503) |
| GET    | `/health/live`   | Liveness: process is up (200)                 |
| GET    | `/api/v1`        | API root (versioned prefix)                   |

Business endpoints (prefixed with `API_PREFIX`, default `/api/v1`). "Auth"
column: 🔓 public, 🔑 requires a valid access token, and any required permission
key.

| Method | Path               | Auth                     | Description                                              |
| ------ | ------------------ | ------------------------ | ------------------------------------------------------- |
| POST   | `/auth/register`   | 🔓                       | Create an owner account + first store; returns tokens   |
| POST   | `/auth/login`      | 🔓                       | Authenticate; returns user, store and a token pair      |
| POST   | `/auth/refresh`    | 🔓 (refresh token)       | Rotate the refresh token, mint a new access token       |
| POST   | `/auth/logout`     | 🔓 (refresh token)       | Revoke the presented refresh token (idempotent)         |
| GET    | `/auth/me`         | 🔑                       | Current user, active store, role slugs and permissions  |
| POST   | `/stores`          | 🔑                       | Create a new store; caller becomes its owner            |
| GET    | `/stores/current`  | 🔑                       | The store the access token is scoped to                 |
| GET    | `/roles`           | 🔑 `team.view`           | System roles + the current store's custom roles         |

### Request bodies

```jsonc
// POST /auth/register
{ "email": "owner@example.com", "password": "min8chars", "fullName": "Olivia Owner", "storeName": "Olivia Boutique" }

// POST /auth/login
{ "email": "owner@example.com", "password": "min8chars" }

// POST /auth/refresh  and  POST /auth/logout
{ "refreshToken": "<jwt>" }

// POST /stores
{ "name": "My Second Store" }
```

Authenticated requests send the access token as `Authorization: Bearer <token>`.

## Authentication & RBAC

- **Tokens.** Login/registration return a short-lived **access token** (default
  `15m`) and a long-lived **refresh token** (default `7d`). The access token
  embeds the active `storeId`, scoping every request to one tenant.
- **Refresh rotation + reuse detection.** Each refresh persists a row keyed by
  the token's `jti`. Rotating revokes the old row and links it to its successor.
  Presenting an already-revoked token is treated as theft and revokes **all** of
  the user's active refresh tokens.
- **Multi-tenancy.** A **store** is a tenant. `store_users` records membership;
  `user_roles` assigns roles per `(user, store)`. Every business entity belongs
  to a store.
- **Permission-based authorization.** Roles are named bundles of granular
  permission keys (e.g. `products.edit`, `team.view`). Routes are guarded by
  `requirePermission(...keys)`, not by role name. System roles (Owner, Manager,
  Product Manager, Order Employee, Customer Support, Marketer, Accountant,
  Viewer) are seeded templates shared by all tenants; the store creator is
  assigned **Owner**. The full catalog lives in `src/config/rbac.ts`.

## Response Shape

Success:

```json
{ "success": true, "data": {}, "message": "" }
```

Error:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "" } }
```

## Environment Variables

Copy `.env.example` to `.env` and adjust:

| Variable              | Default                                                       | Description                                |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| `NODE_ENV`            | `development`                                                 | `development` \| `test` \| `production`    |
| `PORT`                | `4000`                                                        | HTTP port                                  |
| `HOST`                | `0.0.0.0`                                                     | Bind address                               |
| `API_PREFIX`          | `/api/v1`                                                     | Prefix for business routes                 |
| `LOG_LEVEL`           | `info`                                                        | Pino log level                             |
| `CORS_ORIGIN`         | `http://localhost:5173`                                       | Comma-separated origins, or `*`            |
| `DATABASE_URL`        | `postgresql://postgres:postgres@localhost:5432/saas_dashboard` | PostgreSQL connection string            |
| `DB_POOL_MAX`         | `10`                                                          | Max PostgreSQL pool connections            |
| `DB_CONNECTION_TIMEOUT_MS` | `10000`                                                 | Max wait to acquire a connection           |
| `DB_IDLE_TIMEOUT_MS`  | `30000`                                                       | Idle connection release (0 disables)       |
| `REDIS_URL`           | `redis://localhost:6379`                                      | Redis connection (app + BullMQ)            |
| `SHUTDOWN_TIMEOUT_MS` | `10000`                                                       | Graceful shutdown deadline                 |
| `BCRYPT_ROUNDS`       | `12`                                                         | bcrypt cost factor (10–15)                 |
| `JWT_ACCESS_SECRET`   | _(required)_                                                 | Access-token signing secret (≥ 32 chars)   |
| `JWT_REFRESH_SECRET`  | _(required)_                                                 | Refresh-token signing secret (≥ 32 chars)  |
| `JWT_ACCESS_EXPIRES_IN` | `15m`                                                     | Access-token lifetime (e.g. `15m`, `1h`)   |
| `JWT_REFRESH_EXPIRES_IN` | `7d`                                                     | Refresh-token lifetime (e.g. `7d`)         |

> Generate strong secrets with `openssl rand -hex 32`. Startup fails fast if the
> JWT secrets are missing or shorter than 32 characters.

## Running the API

```bash
cd apps/api
npm install
cp .env.example .env

# Start PostgreSQL + Redis locally (requires Docker)
docker compose up -d

# Create tables and seed the RBAC catalog (first run only)
npm run db:migrate
npm run db:seed

# Development (hot reload)
npm run dev

# Production
npm run build
npm start
```

The API requires PostgreSQL and Redis to be reachable; it performs a startup
connectivity check and exits if either is unavailable.

## Database / Migrations

```bash
npm run db:generate   # generate SQL migrations from src/db/schema
npm run db:migrate    # apply pending migrations
npm run db:seed       # seed permission keys + system roles (idempotent)
npm run db:push       # push schema directly (dev only)
npm run db:studio     # open Drizzle Studio
```

First-time setup, after the database is reachable:

```bash
npm run db:migrate    # create the tables
npm run db:seed       # populate permissions + system roles
```

> Phase 3 introduces eight tables — `users`, `stores`, `store_users`, `roles`,
> `permissions`, `role_permissions`, `user_roles`, `refresh_tokens` — with
> multi-tenant scoping by `store_id`. `db:seed` is required before registration
> works, as it creates the **Owner** system role assigned to new store creators.

## Quality Checks

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run format:check  # prettier
```
