# API (Express) — Phase 2: Backend Foundation

Production-ready Express + TypeScript foundation for the SaaS E-commerce
Operations Dashboard. This phase delivers the API skeleton only: configuration,
database/cache/queue connectivity, validation, error handling, logging, and a
health endpoint. No business modules yet (those start in Phase 3).

## Tech Stack

- **Express.js** (v4) + **TypeScript** (CommonJS build)
- **PostgreSQL** via **Drizzle ORM** + `pg` (migrations through `drizzle-kit`)
- **Redis** via `ioredis`
- **BullMQ** for background jobs (infrastructure only; no jobs yet)
- **Zod** for environment + request validation
- **Pino** / `pino-http` for structured logging
- `helmet`, `cors`, `compression` for hardening

## Folder Structure

```txt
apps/api/
  src/
    config/
      env.ts                 # Zod-validated, typed environment config
    lib/
      api-response.ts        # success/error response envelopes
      async-handler.ts       # async route wrapper
      errors.ts              # AppError hierarchy + error codes
      logger.ts              # Pino logger
    middleware/
      error-handler.ts       # centralized error formatting
      not-found.ts           # 404 handler
      request-logger.ts      # pino-http + request id
      validate.ts            # Zod request validation factory
    db/
      index.ts               # pg Pool + Drizzle client + health probe
      migrate.ts             # migration runner (npm run db:migrate)
      schema/index.ts        # Drizzle schema barrel (tables added in Phase 3)
    redis/
      index.ts               # general-purpose Redis client + probe
    queue/
      connection.ts          # dedicated BullMQ Redis connection + probe
      index.ts               # queue factory/registry
    modules/
      health/                # health.routes / .controller / .service
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

| Method | Path             | Description                                   |
| ------ | ---------------- | --------------------------------------------- |
| GET    | `/health`        | Readiness: PostgreSQL + Redis + queue (200/503) |
| GET    | `/health/live`   | Liveness: process is up (200)                 |
| GET    | `/api/v1`        | API root (versioned prefix)                   |

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

## Running the API

```bash
cd apps/api
npm install
cp .env.example .env

# Start PostgreSQL + Redis locally (requires Docker)
docker compose up -d

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
npm run db:push       # push schema directly (dev only)
npm run db:studio     # open Drizzle Studio
```

> The schema is intentionally empty in Phase 2. Tables (users, stores, roles,
> permissions, ...) are introduced in Phase 3, where multi-tenant scoping by
> `store_id` is enforced.

## Quality Checks

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run format:check  # prettier
```
