# SaaS E-commerce Operations Dashboard — MVP Plan

## Project Overview

This project is a SaaS dashboard for WordPress/WooCommerce stores.  
The dashboard is an external web application connected to WordPress through a lightweight WordPress Connector Plugin.

The system is built for Arabic stores first, with RTL UI, light mode, and dark mode.

The main goal of the MVP is to help store owners:

- Reduce employee workload
- Reduce human mistakes
- Manage products, orders, and customers from one simple dashboard
- Track sales performance
- Run basic automations
- Avoid using the default WordPress admin for daily operations

---

## Final Tech Stack

### Frontend

- React.js
- Tailwind CSS
- shadcn/ui
- RTL Arabic UI
- Light / Dark Mode
- React Router
- React Query
- React Hook Form
- Zod
- Axios

### Backend

- Express.js
- PostgreSQL
- Redis
- BullMQ
- JWT Authentication
- RBAC Permissions
- REST API
- Webhooks

### WordPress Connector Plugin

- PHP
- WordPress REST API
- WooCommerce integration
- Webhooks
- API key based connection

---

## System Architecture

```txt
React Dashboard
      |
      v
Express.js API
      |
      |---- PostgreSQL
      |---- Redis
      |---- BullMQ Workers
      |
      v
WordPress Connector Plugin
      |
      v
WooCommerce
```

---

## MVP Scope

### Included in MVP

- Multi-tenant SaaS structure
- Authentication
- Store owner and employee users
- Roles and permissions
- WordPress store connection
- Manual sync from WooCommerce
- Products sync
- Orders sync
- Customers sync
- Dashboard analytics
- Product management
- AI product description generation
- Orders management
- Customers overview
- Basic automations
- Notifications center
- Arabic RTL UI
- Light and dark mode

### Not Included in MVP

Do not build these in MVP:

- Advanced CRM
- Chatwoot integration
- WhatsApp CRM inbox
- Advanced marketing campaigns
- Smart coupons
- Fraud detection AI
- AI health score
- Shipping integrations
- Accounting
- Workflow builder
- Mobile app
- Multi-language dashboard

---

# Implementation Status (as of 2026-06-23)

> This snapshot reflects the actual approved implementation and is the source of truth for what is built versus pending. Phase ordering was revised: the **Products Module now ships before WooCommerce Sync**.

## Status Legend

- ✅ COMPLETED — implemented and verified
- 🟡 PARTIAL — foundation in place, some sub-features still pending
- ⏭️ NEXT — the next phase to implement
- ⏳ PENDING — not started

## Phase Status

| Phase | Name | Status |
|-------|------|--------|
| 0 | Repository & Project Setup | ✅ COMPLETED |
| 1 | Frontend Foundation | ✅ COMPLETED |
| 2 | Backend Foundation | ✅ COMPLETED |
| 3 | Auth, Tenants, Roles & Permissions | ✅ COMPLETED |
| 4 | WordPress Connector Plugin Foundation | ✅ COMPLETED |
| 4.5 | Dashboard Auth Integration & API Client | ✅ COMPLETED |
| 5 | Products Module | ✅ COMPLETED |
| 5.1 | Products Module Foundation | ✅ COMPLETED |
| 5.2 | Hardening: Real Connection Backend + Auth Rate Limiting | ✅ COMPLETED |
| 6 | WooCommerce Sync Foundation | ✅ COMPLETED |
| 7 | Orders Module | ✅ COMPLETED |
| 8 | Customers Module | ✅ COMPLETED |
| 9 | Dashboard Analytics | ✅ COMPLETED |
| 10 | Notifications Center | ✅ COMPLETED |
| 11 | Automations MVP | ✅ COMPLETED |
| 12 | Settings Module | ⏭️ NEXT |
| 12.5 | AI Assistants | ⏳ PENDING |
| 13 | Webhooks & Incremental Sync | ⏳ PENDING |
| 13.5 | Audit Logs | ⏳ PENDING |
| 14 | QA, Permissions & Production Readiness | ⏳ PENDING |

## Known Deferrals Within Completed Phases

- Product publish to WooCommerce currently returns a validated payload preview (HTTP 202, `dispatched: false`); actual delivery to WooCommerce is deferred to Phase 6.
- CSV/Excel import and product image upload are not yet implemented (planned within the Products Module track). AI product description is deferred to Phase 12.5 (AI Assistants).
- The live connect/verify handshake against a production WordPress + WooCommerce store will be exercised in Phase 6.

---

# Phase 0 — Repository & Project Setup ✅ COMPLETED

## Goal

Create the initial monorepo/project structure for frontend, backend, workers, and WordPress plugin.

## Suggested Structure

```txt
project-root/
  apps/
    dashboard/
    api/
    workers/
  plugins/
    wordpress-connector/
  packages/
    shared/
  docs/
    plan.md
```

## Tasks

- Create project structure.
- Setup React app in `apps/dashboard`.
- Setup Express app in `apps/api`.
- Setup BullMQ workers app in `apps/workers`.
- Setup WordPress plugin folder in `plugins/wordpress-connector`.
- Add shared types/helpers package if needed.
- Add environment files examples.
- Add basic README.
- Add linting and formatting.

## Acceptance Criteria

- Frontend app runs locally.
- Backend app runs locally.
- Workers app starts without errors.
- WordPress plugin folder exists with a valid plugin header.
- Environment examples exist.
- No unrelated features are implemented in this phase.

---

# Phase 1 — Frontend Foundation ✅ COMPLETED

## Goal

Build the Arabic RTL dashboard foundation with routing, layout, theme, and reusable UI components.

## Pages

```txt
/login
/register
/forgot-password
/reset-password
/dashboard
```

## Tasks

- Setup Tailwind CSS.
- Setup shadcn/ui.
- Configure RTL layout.
- Configure Arabic font.
- Add light/dark mode.
- Create base app layout:
  - Sidebar
  - Topbar
  - Main content area
  - Mobile sidebar
- Create auth pages UI only.
- Create dashboard placeholder page.
- Create shared UI components:
  - PageHeader
  - StatsCard
  - DataTable wrapper
  - EmptyState
  - LoadingState
  - ErrorState
  - ConfirmDialog
  - StatusBadge
  - SearchInput
  - FilterBar

## Navigation Labels

Use Arabic labels:

```txt
لوحة التحكم
المنتجات
الطلبات
العملاء
الموظفين والصلاحيات
الأتمتة
الإشعارات
الإعدادات
```

## Acceptance Criteria

- UI is fully RTL.
- Sidebar works on desktop and mobile.
- Light/dark mode works.
- Arabic labels are used.
- Auth pages exist as UI.
- No backend integration is required yet.

---

# Phase 2 — Backend Foundation ✅ COMPLETED

## Goal

Create the Express API foundation with database connection, authentication structure, validation, and error handling.

## Tasks

- Setup Express.js project.
- Setup PostgreSQL connection.
- Choose and configure ORM: Prisma or Drizzle.
- Setup Redis connection.
- Setup Zod validation.
- Setup centralized error handling.
- Setup request logging.
- Setup API response format.
- Setup health endpoint.

## Required Endpoints

```txt
GET /health
```

## Recommended API Response Shape

```json
{
  "success": true,
  "data": {},
  "message": ""
}
```

Error shape:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": ""
  }
}
```

## Acceptance Criteria

- API starts successfully.
- Database connection works.
- Redis connection works.
- `/health` returns success.
- Errors are returned in a consistent format.
- No business modules are required yet.

---

# Phase 3 — Auth, Tenants, Roles & Permissions ✅ COMPLETED

## Goal

Build the SaaS account foundation: users, stores, roles, and permissions.

## Core Concept

Each store is a tenant.

```txt
Store = Tenant
User can belong to one or more stores
Each user has a role per store
Each role has permissions
```

## Database Tables

```txt
users
stores
store_users
roles
permissions
role_permissions
user_roles
refresh_tokens
```

## Default Roles

```txt
Owner
Manager
Product Manager
Order Employee
Customer Support
Marketer
Accountant
Viewer
```

## Permissions

```txt
dashboard.view
products.view
products.create
products.edit
products.delete
orders.view
orders.edit
customers.view
team.view
team.create
team.edit
team.delete
automations.view
automations.edit
settings.view
settings.edit
```

## Backend Endpoints

```txt
POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/refresh
POST /auth/forgot-password
POST /auth/reset-password
GET  /auth/me

GET  /stores/current
POST /stores
PATCH /stores/:id

GET    /roles
POST   /roles
PATCH  /roles/:id
DELETE /roles/:id

GET    /team
POST   /team/invite
PATCH  /team/:id
DELETE /team/:id
```

## Frontend Tasks

- Connect login/register pages to API.
- Store auth token securely.
- Add protected routes.
- Add permission guard component.
- Build team page.
- Build roles page.

## Acceptance Criteria

- Store owner can register.
- Store is created for owner.
- Owner role is assigned automatically.
- Login works.
- Protected routes work.
- Permissions can block UI actions.
- Team and roles pages are functional.

---

# Phase 4 — WordPress Connector Plugin Foundation ✅ COMPLETED

## Goal

Build a lightweight WordPress plugin that connects a WooCommerce store to the SaaS dashboard.

## Plugin Responsibilities

- Show connection status inside WordPress admin.
- Store SaaS API URL and API key.
- Verify connection with SaaS backend.
- Expose health endpoint.
- Prepare WooCommerce data sync.

## Plugin Admin Page

Create admin page:

```txt
SaaS Connector
```

Fields:

```txt
SaaS API URL
API Key
Connection Status
Connect Button
Disconnect Button
Manual Sync Button
Last Sync Time
```

## Plugin REST Endpoints

```txt
GET  /wp-json/saas/v1/health
POST /wp-json/saas/v1/connect
POST /wp-json/saas/v1/disconnect
POST /wp-json/saas/v1/sync
```

## Backend Endpoints

```txt
POST /wp/connect
POST /wp/verify
POST /wp/disconnect
GET  /stores/:id/connection-status
```

## Security Requirements

- Use API key authentication.
- Never expose raw API key after saving.
- Verify requests from WordPress.
- Verify requests from SaaS to WordPress.

## Acceptance Criteria

- Plugin can be installed in WordPress.
- Plugin admin page exists.
- Store can be connected to SaaS.
- SaaS dashboard shows connection status.
- Health check works from both sides.

---

# Phase 4.5 — Dashboard Auth Integration & API Client ✅ COMPLETED

## Goal

Connect the React dashboard to the real backend auth system from Phase 3, replacing UI-only auth with live API calls, token persistence, and protected routing. This was the glue that made the dashboard real instead of mocked.

## Implemented

- Shared HTTP client (`apiRequest`) that unwraps the success/error envelope.
- Automatic 401 handling: deduped refresh-token call, retry-once, then forced logout.
- Access/refresh token persistence in localStorage (`saas.accessToken`, `saas.refreshToken`).
- `AuthProvider` context and `ProtectedRoute` guard.
- Login and Register pages wired to the real backend.
- Topbar wired to the authenticated user and logout.

## Backend Touchpoints

```txt
POST /auth/login
POST /auth/register
POST /auth/refresh
GET  /auth/me
```

## Acceptance Criteria

- Login and register work against the real backend.
- Tokens persist across page reloads.
- Expired access tokens are refreshed transparently.
- Protected routes redirect unauthenticated users.

---

# Phase 5 — Products Module ✅ COMPLETED

## Goal

Allow store users to view, create, edit, archive, and publish products from the SaaS dashboard. Implemented **before** WooCommerce Sync so the dashboard has a working product surface and a publish foundation ahead of bulk import.

This phase shipped in two parts: **5.1 (foundation)** and **5.2 (hardening)**.

## Frontend Pages

```txt
/products
/products/new
/products/:id
/products/:id/edit
```

## Backend Endpoints

```txt
GET    /products             ✅ list (search / filter / pagination)
GET    /products/:id         ✅ details
POST   /products             ✅ create
PATCH  /products/:id         ✅ update
DELETE /products/:id         ✅ archive (soft delete)
POST   /products/:id/publish 🟡 publish foundation (payload preview, delivery deferred to Phase 6)
POST   /wp/products/sync     ✅ connector-authenticated upsert from WordPress
```

---

## Phase 5.1 — Products Module Foundation ✅ COMPLETED

### Implemented

- Drizzle `products` schema + migration (0002), store-scoped.
- Products module: service, controller, routes, Zod schemas, serializer (with unit tests).
- Full CRUD with RBAC permissions (`products.view` / `create` / `edit` / `delete`).
- Soft-delete (archive) instead of hard delete.
- Dashboard pages: list (search/filter/pagination), create, details, edit, and a shared `ProductForm`.
- `products-api.ts` client wired through `apiRequest`.
- WordPress plugin product class (`class-saas-connector-products.php`) for create/sync hooks.
- Publish foundation: validates and returns the WooCommerce payload preview (HTTP 202, `dispatched: false`). Actual delivery to WooCommerce is deferred to Phase 6.

### Pending

- CSV/Excel import (`POST /products/import`) — planned within the Products track.
- Product image upload — planned within the Products track.
- Real publish delivery to WooCommerce + returned WooCommerce product ID — lands in Phase 6.
- AI product description (`POST /products/ai-description`) — **deferred to Phase 12.5 (AI Assistants)**; intentionally kept out of the immediate Phase 6/7/8 path.

### BullMQ Jobs (planned)

```txt
publish_product_to_wp
import_products
```

---

## Phase 5.2 — Hardening: Real Connection Backend + Auth Rate Limiting ✅ COMPLETED

### Implemented

- Connection UI wired to the real backend (simulation removed):
  - `GET /wp/connection-status` (JWT) — status shown in the dashboard.
  - `POST /stores/current/api-key` (JWT) — generate / reveal one-time API key.
  - `POST /stores/current/disconnect` (JWT) — new disconnect endpoint.
- Connect/verify remain connector-key authenticated (driven by the WordPress plugin).
- Auth rate limiting (Redis fixed-window, fail-open) on `POST /auth/login`, `/auth/register`, and `/auth/refresh`, returning `RATE_LIMITED` (429) with `Retry-After`.
- Rate-limit window / max / enabled configurable via env (`AUTH_RATE_LIMIT_*`).

### Acceptance Criteria

- Connection status loads from the real backend and persists after refresh. ✅
- Generated API key is stored in the database (verified) and shown once in the UI. ✅
- Disconnect updates the connection status. ✅
- Exceeding the auth limit returns 429 `RATE_LIMITED`; valid logins still succeed. ✅

---

# Phase 6 — WooCommerce Sync Foundation ✅ COMPLETED

## Implementation Notes (completed)

- **DB (migration 0003):** added `customers`, `orders`, `order_items`, `product_images`, `external_mappings`, `sync_jobs`, `webhook_events` (created only — no webhook processing yet), and extended `store_connections` with encrypted outbound-key columns (`api_key_cipher` / `api_key_iv` / `api_key_tag`) + `last_sync_at`.
- **Generic `external_mappings`** (product/order/customer · source = woocommerce) is the idempotency backbone; unique on `(store_id, entity_type, source, external_id)`.
- **Backend sync module** (`/sync/products|orders|customers|all` + `/sync/status`), JWT-protected, `settings.edit` to run / `settings.view` to read, tenant-scoped, Zod-validated. Sync pulls WooCommerce data from the connector and upserts idempotently.
- **Outbound delivery (SaaS → WordPress):** the connector key is encrypted at rest (AES-256-GCM, `CONNECTOR_ENCRYPTION_KEY`) so the SaaS can sign requests the plugin verifies. Raw/encrypted key material is never exposed in any API response.
- **Product publish completed:** `POST /products/:id/publish` now creates/updates the product in WooCommerce, stores the returned `wp_product_id`, refreshes the mapping, and returns `dispatched: true`.
- **Connector plugin (v0.2.0):** signature-authenticated read endpoints (`/sync/products|orders|customers`), a Manual Sync button, and last-sync time. Stays a thin connector — all sync business logic lives in the SaaS.
- **BullMQ:** queues `sync_products`, `sync_orders`, `sync_customers`, `sync_all`, `publish_product_to_wp` are registered as foundation; manual sync + publish run **synchronously** in this phase (no worker consumers yet).
- **Not in this phase (deferred):** webhook processing (Phase 13), retry strategy, soft-delete strategy, Orders/Customers UI (Phases 7–8). Live WooCommerce round-trip was not exercised (no WP/Woo test environment); covered by structural tests instead.

## Goal

Sync WooCommerce data (products, orders, customers) into the SaaS database. It also delivers the real product publish path deferred from Phase 5.

## Database Tables

```txt
products            (extend existing schema)
product_images
orders
order_items
customers
external_mappings
sync_jobs
webhook_events
```

## Order Fields

```txt
id
store_id
wp_order_id
customer_id
order_number
status
total
currency
payment_method
created_at
updated_at
```

## Customer Fields

```txt
id
store_id
wp_customer_id
name
email
phone
total_spent
orders_count
last_order_at
created_at
updated_at
```

## External Mappings

Use one generic mapping table instead of separate mapping tables for products, orders, and customers.

Fields:

```txt
id
store_id
entity_type
local_id
external_id
source
created_at
updated_at
```

Supported `entity_type`:

```txt
product
order
customer
```

Supported `source`:

```txt
woocommerce
```

## Backend Endpoints

```txt
POST /sync/products
POST /sync/orders
POST /sync/customers
POST /sync/all
GET  /sync/status
```

## WordPress Plugin Tasks

- Fetch WooCommerce products.
- Fetch WooCommerce orders.
- Fetch WooCommerce customers.
- Send data to SaaS API.
- Save last sync time.
- Add manual sync button.
- Deliver dashboard-created products to WooCommerce (completes the Phase 5 publish foundation).

## BullMQ Jobs

```txt
sync_products
sync_orders
sync_customers
sync_all
publish_product_to_wp
```

## Acceptance Criteria

- Manual sync works.
- Products appear in SaaS dashboard.
- Orders appear in SaaS dashboard.
- Customers appear in SaaS dashboard.
- Repeated sync does not create duplicates.
- Data is scoped by store_id.
- Dashboard-published products are created in WooCommerce and return a WooCommerce product ID.

---

# Phase 7 — Orders Module ✅ COMPLETED

## Implementation Notes (completed)

- **DB (migration 0004):** added `internal_notes` (dashboard-only operator notes, never written by sync) to the existing `orders` table. Added a canonical `ORDER_STATUSES` list (`pending`, `processing`, `on-hold`, `completed`, `cancelled`, `refunded`, `failed`) used for the status filter; the `status` column itself stays free text to tolerate any Woo value.
- **Backend orders module** (`/orders`, `/orders/:id`, `/orders/:id/notes`): JWT-protected, tenant-scoped by `storeId`, Zod-validated, mirroring the Products module shape (schemas / serializer / service / controller / routes). List supports search (order number + linked customer name/email/phone via a LEFT JOIN), status filter, inclusive date-range filter on `coalesce(placed_at, created_at)`, and pagination. Details returns the order, its line items, and a customer summary (null for guest orders). Notes update normalizes empty/whitespace to `null`.
- **Permissions:** `orders.view` for list/details, `orders.edit` for the notes update — enforced by `requirePermission`. Read-only path is read-only.
- **Frontend (Arabic RTL):** `/orders` list (search, status filter, date-from/date-to, table with order number / customer / status badge / total / payment method / created date, loading/empty/error states, pagination) and `/orders/:id` details (order summary, customer info, items table, status badge, internal-notes editor + save, back button). The notes editor is gated by `orders.edit` (read-only without it). The dashboard `AuthProvider` now exposes `permissions` + `hasPermission()` for UI gating.
- **Read-only integration with Phase 6:** the module only reads the orders/order_items/customers rows that sync produces; Phase 6 sync behavior was not modified.
- **Not in this phase (out of scope):** no order creation from the dashboard, no customers UI (Phase 8), no analytics (Phase 9), no notifications/automations/webhooks/WhatsApp/shipping/AI.

## Goal

Allow users to view and manage WooCommerce orders from the SaaS dashboard.

## Frontend Pages

```txt
/orders
/orders/:id
```

## Features

- Orders list
- Search
- Filter by status
- Filter by date
- Order details
- Customer information
- Order items
- Internal notes

## Backend Endpoints

```txt
GET   /orders
GET   /orders/:id
PATCH /orders/:id/notes
```

## Acceptance Criteria

- Orders list loads from SaaS database.
- Order details page works.
- Order items are shown.
- Customer summary is shown.
- Internal notes can be saved.
- User permissions are respected.

---

# Phase 8 — Customers Module ✅ COMPLETED

## Implementation Notes (completed)

- **DB (migration 0005):** added `internal_notes` (dashboard-only operator notes, never written by sync) to the existing `customers` table.
- **RBAC:** added a new `customers.edit` permission (the catalog previously had only `customers.view`); granted to `owner` (via ALL), `manager`, and `customer-support`. Seed is idempotent and was re-run.
- **Backend customers module** (`/customers`, `/customers/:id`, `/customers/:id/notes`): JWT-protected, tenant-scoped by `storeId`, Zod-validated, mirroring the Orders module shape. List supports search (name/email/phone, wildcards escaped), pagination, and a deterministic newest-first order (createdAt + id tiebreaker); list columns use the WooCommerce-synced aggregate fields (fast, no per-row queries). Details computes metrics from the customer's locally synced orders in a single aggregate query, plus the most recent linked orders (read-only, capped at 20). Notes update normalizes empty/whitespace to `null`.
- **Metric status policy (audited):** `totalOrders` counts ALL of the customer's orders; `totalSpent` counts only PAID orders (`completed`, `processing`) so refunded/cancelled/failed/pending money is not reported as spent (matches WooCommerce's paid-status definition); `firstOrderAt`/`lastOrderAt` span all statuses.
- **DB (migration 0006):** added a partial index `orders_store_customer_idx` on `orders (store_id, customer_id) WHERE customer_id IS NOT NULL` to back the per-customer metrics + linked-orders queries.
- **Permissions:** `customers.view` for list/details, `customers.edit` for the notes update — enforced by `requirePermission`.
- **Frontend (Arabic RTL):** `/customers` list (search, pagination, columns: name / email / phone / total orders / total spent / created date, loading/empty/error states) and `/customers/:id` details (metric tiles, profile, recent orders table linking to order details, internal-notes editor + save gated by `customers.edit`, back button).
- **Read-only integration with Phase 6:** the module only reads the customers/orders rows that sync produces; Phase 6 sync behavior was not modified.
- **Divergence from the original plan sketch (intentional, per the approved Phase 8 scope):** notes + `customers.edit` + summary metrics + embedded recent-orders replace the sketch's separate `GET /customers/:id/orders` endpoint; the جديد/نشط/متأخر/VIP status label is **not** implemented (kept out to avoid CRM scope creep) — available to add later if desired.
- **Not in this phase (out of scope):** no customer create/delete/merge/import/export, no analytics (Phase 9), no notifications/automations/webhooks/WhatsApp/email/AI.

## Goal

Show customer data and purchase history without building a full CRM.

## Frontend Pages

```txt
/customers
/customers/:id
```

## Features

- Customers list
- Search by name/email/phone
- Customer details
- Total spent
- Orders count
- Last order date
- Customer order history
- Customer status label:
  - جديد
  - نشط
  - متأخر
  - VIP

## Backend Endpoints

```txt
GET /customers
GET /customers/:id
GET /customers/:id/orders
```

## Acceptance Criteria

- Customer list loads correctly.
- Customer details page works.
- Order history is shown.
- Customer stats are accurate.
- No advanced CRM features are added.

---

# Phase 9 — Dashboard Analytics ✅ COMPLETED

## Implementation Notes (completed)

- **Backend dashboard module** (`/dashboard/summary|sales-chart|orders-chart|recent-orders|top-products|low-stock`): JWT-protected, every route requires `dashboard.view`, tenant-scoped by `storeId`, Zod-validated. No schema/migration changes (reads existing orders/order_items/products/customers).
- **Revenue rule:** revenue = `sum(orders.total)` over PAID statuses only — `completed`, `processing`, `on-hold`; `cancelled`/`refunded`/`failed`/`pending` are excluded. AOV = paid revenue ÷ paid order count (this month). Order *counts* and the status distribution span all statuses. (Note: this is the Phase 9 spec's paid set — slightly wider than Phase 8's customer `total_spent`, which excludes `on-hold`; documented intentionally.)
- **Date filters:** `today`, `7d`, `30d`, `this_month`, `custom` — resolved to half-open `[start, end)` ranges in **UTC** by a pure, unit-tested resolver (timezone-safe). Charts zero-fill every day bucket. Summary KPIs are fixed-period (today / this month / current totals), independent of the filter. Custom ranges are capped at 366 days (validation 400) so chart buckets, response size, and cache payloads stay bounded.
- **Caching:** Redis read-through cache, 5-min TTL (`DASHBOARD_CACHE_TTL_SECONDS`), fail-open. Cache keys are namespaced `dashboard:<storeId>:<endpoint>:<rangeKey>...` so cross-store reads are impossible; `?refresh=true` bypasses the read. Permission failures (403) short-circuit before any cache access, so they are never cached.
- **Low stock:** active products with `stock_quantity <= threshold` (`DASHBOARD_LOW_STOCK_THRESHOLD`, default 5). `productsCount` = non-archived catalog.
- **Frontend (Arabic RTL):** real `/dashboard` replacing the placeholder — 9 KPI cards, revenue + orders bar charts (lightweight dependency-free SVG/CSS components, no external chart lib), order-status distribution bars, recent-orders / top-products / low-stock tables, a date-range filter, a refresh button, and loading/error/empty states. Light + dark compatible.
- **Read-only:** sync behavior was not modified.
- **Not in this phase (out of scope):** notifications (Phase 10), automations (Phase 11), settings (Phase 12), webhooks (Phase 13), AI (Phase 12.5).

## Goal

Build the main dashboard with essential sales and operations insights.

## Dashboard Sections

### Cards

```txt
مبيعات اليوم
مبيعات الشهر
عدد الطلبات
عدد العملاء
المنتجات منخفضة المخزون
```

### Charts

```txt
Sales over time
Orders over time
```

### Tables

```txt
آخر الطلبات
أفضل المنتجات
منتجات منخفضة المخزون
آخر التنبيهات
```

## Backend Endpoints

```txt
GET /dashboard/summary
GET /dashboard/sales-chart
GET /dashboard/orders-chart
GET /dashboard/recent-orders
GET /dashboard/top-products
GET /dashboard/low-stock
```

## Acceptance Criteria

- Dashboard loads real data.
- Data is scoped by store_id.
- Charts work.
- Low stock products are shown.
- Recent orders are shown.
- Empty states are handled.

---

# Phase 10 — Notifications Center ✅ COMPLETED

## Implementation Notes (completed)

- **DB (migration 0007):** added a generic, tenant-scoped `notifications` table (`id`, `store_id`, `type`, `title`, `message`, `severity`, `read_at`, `metadata` jsonb, `created_at`, `updated_at`). `type` and `severity` stay free text backed by canonical lists (`NOTIFICATION_TYPES`: new_order / low_stock / failed_sync / failed_automation / daily_report; `NOTIFICATION_SEVERITIES`: info / success / warning / error) so future automations can write rows without a schema change. Two indexes: `notifications_store_created_idx` (store_id, created_at, id) backs the list + deterministic newest-first sort; partial `notifications_store_unread_idx` backs the unread count/filter.
- **Backend notifications module** (`/notifications`, `/notifications/:id/read`, `/notifications/read-all`): JWT-protected, tenant-scoped by `storeId`, Zod-validated, mirroring the Customers/Orders module shape (schemas / serializer / service / controller / routes + unit tests). List supports a read/unread filter and pagination, returns a store-wide `unreadCount` (independent of the filter) for the topbar badge, and is ordered `created_at desc, id desc`. Mark-as-read is idempotent (`coalesce(read_at, now())`). Read-all only touches the caller's store.
- **Permission:** every route requires `dashboard.view` (held by all seeded roles) — per the Phase 10 spec, notifications are visible to anyone who can view the dashboard; the same permission gates the mark-read actions since they only touch the caller's own store data.
- **Frontend (Arabic RTL):** real `/notifications` page replacing the placeholder — card list with severity accent bar + colored severity badge, Arabic type label, unread dot indicator, created date, per-item "تحديد كمقروء", a "تحديد الكل كمقروء" action, a الكل/غير المقروءة/المقروءة filter, pagination, and loading/empty/error states (light + dark). Added a topbar bell with an unread-count badge that refreshes on mount and on route change (no realtime/polling). `notifications-api.ts` client wired through `apiRequest`.
- **Generic + reusable:** the table/module are intentionally automation-agnostic — Phase 11 automations (low-stock alerts, daily reports, failed-automation/sync messages) can insert notifications directly with no further schema work.
- **Not in this phase (out of scope, deferred):** no automations / job queues / WhatsApp / email / daily-report generation / low-stock automation / webhooks; notifications are manually seeded for testing. Sync behavior was not modified.

## Goal

Create a central place for system notifications. Built **before** Automations because automations (low stock alerts, daily reports, failed-automation messages) depend on the notifications system.

## Frontend Page

```txt
/notifications
```

## Database Tables

```txt
notifications
```

## Notification Types

```txt
new_order
low_stock
failed_sync
failed_automation
daily_report
```

## Backend Endpoints

```txt
GET   /notifications
PATCH /notifications/:id/read
POST  /notifications/read-all
```

## Acceptance Criteria

- Notifications appear in dashboard.
- Notifications page works.
- User can mark notification as read.
- User can mark all as read.
- Notifications are store-scoped.

---

# Phase 11 — Automations MVP ✅ COMPLETED

## Implementation Notes (completed)

- **DB (migration 0008):** added two tenant-scoped tables. `automations` (`id`, `store_id`, `type`, `enabled`, `config` jsonb, timestamps) with a unique `(store_id, type)` index — each store has exactly one row per type, lazily provisioned with defaults (disabled) on first read/run via `onConflictDoNothing`. `automation_logs` (`id`, `store_id`, `automation_id`, `type`, `status`, `message`, `metadata` jsonb, `created_at`) with an index on `(store_id, automation_id, created_at, id)` backing the newest-first logs list. `type` and `status` stay free text backed by canonical lists (`AUTOMATION_TYPES`, `AUTOMATION_LOG_STATUSES`: success / skipped / queued / failed).
- **Backend automations module** (`/automations`, `/automations/:id`, `/automations/:id/logs`): JWT-protected, tenant-scoped by `storeId`, Zod-validated, mirroring the Notifications/Customers module shape (config / schemas / serializer / service / controller / routes + unit tests). Per-type config is validated against a strict per-type Zod schema (`low_stock_alert {threshold}`, `daily_sales_report {time HH:MM}`, `whatsapp_order_message {message_template}`); partial config updates merge onto the normalized stored config so rows stay complete and valid.
- **Permissions:** `automations.view` for list + logs, `automations.edit` for PATCH — enforced by `requirePermission`. Both keys already existed in the RBAC catalog (owner/manager = view+edit, marketer = view-only) so no seed change was needed.
- **Run helpers (manual execution):** `runLowStockCheck`, `runDailySalesReport`, `runWhatsappOrderMessage` are the bodies a BullMQ worker would run. Disabled automations are skipped (logged). Low stock finds active products at/under the configured threshold and raises a `low_stock` notification. Daily report computes today's (UTC) paid sales total, order count, top products, and current low-stock count, then raises a `daily_report` notification. WhatsApp renders the template for an order, enqueues a placeholder job, and raises a notification stating a message *would* be sent — **no real WhatsApp/email is ever sent**. Failures write a `failed` log + a `failed_automation` notification. A standalone runner (`src/scripts/run-automation.ts`, `npm run automations:run`) invokes them safely while no worker exists yet.
- **Notifications integration:** added a reusable `createNotification(input)` seam to the Phase 10 notifications service (the generic insert Phase 10 anticipated); every automation writes notifications through it. Confirmed live: notifications appear in the notifications center and topbar badge.
- **BullMQ:** registered queues `automation`, `notification`, `report`, `whatsapp` and job names `low_stock_check`, `send_daily_report`, `send_whatsapp_order_message` as foundation (registered at boot, observable). Like Phase 6 sync, there is **no worker consuming them yet** — run helpers execute synchronously; the WhatsApp helper enqueues a real placeholder job (verified present in Redis: `bull:whatsapp:wait`) to demonstrate the "queued after a new order" path.
- **Frontend (Arabic RTL):** real `/automations` page replacing the placeholder — three automation cards (icon chip + title + description), an enabled toggle that persists immediately, a per-type config editor (threshold number input / time input / message-template textarea) with a Save button, an on-demand recent-logs panel (status badge + message + date), and loading/error/empty states (light + dark, mobile responsive). A dependency-free RTL-aware `Switch` component was added. Edit controls are gated by `automations.edit` (view-only roles get disabled inputs + a read-only note). `automations-api.ts` client wired through `apiRequest`.
- **Not in this phase (out of scope, deferred):** no real WhatsApp/Chatwoot/email, no WhatsApp provider integration, no workflow/advanced automation builder, no AI, no webhooks, no Settings, and no automation worker consumers (queues are foundation only). The plan's "WhatsApp message after a new order" trigger is foundation-only because order creation arrives via webhooks (Phase 13).

## Goal

Build the first 3 automations only. Depends on the Notifications Center (Phase 10) for low stock alerts, daily reports, and failed-automation messages.

## Automations

### 1. Low Stock Alert

When product stock is below configured threshold, create notification.

Config:

```txt
threshold
enabled
```

### 2. Daily Sales Report

Every day, send/create report with:

```txt
sales_total
orders_count
top_products
low_stock_count
```

Config:

```txt
time
enabled
```

### 3. WhatsApp Order Message

When a new order is created, send a WhatsApp message to the customer.

Config:

```txt
message_template
enabled
```

## Database Tables

```txt
automations
automation_logs
```

## Backend Endpoints

```txt
GET   /automations
PATCH /automations/:id
GET   /automations/:id/logs
```

## BullMQ Queues

```txt
automationQueue
notificationQueue
reportQueue
whatsappQueue
```

## Jobs

```txt
low_stock_check
send_daily_report
send_whatsapp_order_message
```

## Acceptance Criteria

- User can enable/disable each automation.
- Low stock alert creates notifications.
- Daily sales report runs through BullMQ.
- WhatsApp order message job is queued after new order.
- Automation logs are stored.
- Failed automations are logged.

---

# Phase 12 — Settings Module ⏳ PENDING

## Goal

Allow store owner/admin to manage store settings, integrations, and API keys.

## Frontend Pages

```txt
/settings
/settings/store
/settings/integrations
/settings/api
/settings/profile
```

## Features

- Store information
- Store connection status
- API key display/regeneration
- WhatsApp settings placeholder
- Profile settings
- Theme preference

## Backend Endpoints

```txt
GET   /settings/store
PATCH /settings/store
GET   /settings/api-key
POST  /settings/regenerate-api-key
GET   /settings/integrations
PATCH /settings/integrations/whatsapp
```

## Acceptance Criteria

- Store settings can be updated.
- API key can be regenerated.
- Connection status is visible.
- WhatsApp settings can be saved as config.
- Theme preference works in frontend.

---

# Phase 12.5 — AI Assistants ⏳ PENDING

## Goal

Add AI-assisted features to the dashboard, starting with AI product description generation. Deferred out of the early Products track so core CRUD and sync land first.

## Features

- AI product description generation.

## Backend Endpoints

```txt
POST /products/ai-description
```

## AI Description Input

```txt
product_name
category
short_notes
tone
```

## AI Description Output

```txt
description
short_description
```

## BullMQ Jobs

```txt
generate_ai_description
```

## Acceptance Criteria

- AI generates a description and a short description.
- Generated content can be reviewed/edited before saving.
- AI calls are store-scoped and respect permissions.
- Failures are handled gracefully without blocking manual product editing.

---

# Phase 13 — Webhooks & Incremental Sync ⏳ PENDING

## Goal

Move from manual sync only to real-time updates using WooCommerce hooks/webhooks.

## WordPress Hooks

```php
woocommerce_new_order
woocommerce_update_order
woocommerce_update_product
woocommerce_product_set_stock
user_register
profile_update
```

## Backend Webhook Endpoints

```txt
POST /wp/webhooks/orders
POST /wp/webhooks/products
POST /wp/webhooks/customers
```

## Requirements

- Verify webhook signature/API key.
- Store webhook event.
- Prevent duplicate processing.
- Queue background sync job.

## Acceptance Criteria

- New WooCommerce order appears in SaaS without manual sync.
- Updated product appears in SaaS.
- Stock updates appear in SaaS.
- Duplicate webhook events are ignored.
- Failed webhook events are logged.

---

# Phase 13.5 — Audit Logs ⏳ PENDING

## Goal

Track important admin and system events for accountability and debugging, before the final QA pass.

## Database Table

```txt
audit_logs
```

## Tracked Events

```txt
login
logout
product created
product updated
product archived
role changes
team changes
store connection changes
sync started
sync completed
sync failed
automation enabled
automation disabled
```

## Backend Endpoints

```txt
GET /audit-logs
```

## Acceptance Criteria

- Audit logs are store-scoped.
- Sensitive data is not logged.
- Important admin actions are tracked.
- Logs can be filtered by user, action, and date.

---

# Phase 14 — QA, Permissions & Production Readiness ⏳ PENDING

## Goal

Make MVP stable enough for a real pilot store.

## QA Checklist

### Auth

- Register works.
- Login works.
- Logout works.
- Refresh token works.
- Protected routes are protected.

### Permissions

- Owner can access everything.
- Product Manager can manage products only.
- Order Employee can view/manage orders only.
- Marketer cannot access sensitive settings.
- Viewer cannot create/edit/delete.

### Store Connection

- Plugin installs.
- API key connects store.
- Disconnect works.
- Health check works.

### Sync

- Products sync correctly.
- Orders sync correctly.
- Customers sync correctly.
- Duplicate sync does not duplicate records.

### UI

- RTL works on all pages.
- Dark mode works.
- Mobile sidebar works.
- Empty states exist.
- Loading states exist.
- Error states exist.

### Automations

- Low stock alert works.
- Daily report job works.
- WhatsApp job queues correctly.
- Failed jobs are logged.

## Acceptance Criteria

- MVP can be tested on one real WooCommerce store.
- No critical console errors.
- No database records leak between stores.
- Every page respects permissions.
- Core flows work end-to-end.

---

# Development Rules For Claude

## General Rules

- Implement one phase at a time only.
- Do not jump to future phases.
- Do not add features outside the current phase.
- Keep the project Arabic RTL first.
- Use clean, readable code.
- Keep frontend and backend separated.
- Do not put heavy business logic inside the WordPress plugin.
- The WordPress plugin should be a connector only.

## Before Starting Each Phase

Claude should:

1. Read this `plan.md` file.
2. Identify the current phase requested by the user.
3. List what will be implemented in this phase.
4. Check existing files before creating duplicates.
5. Implement only the current phase.
6. Run available checks/tests/builds.
7. Provide a final report.

## Final Report Format For Each Phase

```txt
Phase Completed: Phase X — Name

Implemented:
- ...

Files Created:
- ...

Files Modified:
- ...

Checks Run:
- ...

Notes / Remaining:
- ...
```

---

# Recommended Build Order

```txt
Phase 0   — Repository & Project Setup                ✅ COMPLETED
Phase 1   — Frontend Foundation                       ✅ COMPLETED
Phase 2   — Backend Foundation                        ✅ COMPLETED
Phase 3   — Auth, Tenants, Roles & Permissions        ✅ COMPLETED
Phase 4   — WordPress Connector Plugin Foundation     ✅ COMPLETED
Phase 4.5 — Dashboard Auth Integration & API Client   ✅ COMPLETED
Phase 5   — Products Module                           ✅ COMPLETED
Phase 5.1 — Products Module Foundation                ✅ COMPLETED
Phase 5.2 — Hardening (Connection backend + rate limit) ✅ COMPLETED
Phase 6   — WooCommerce Sync Foundation               ✅ COMPLETED
Phase 7   — Orders Module                             ✅ COMPLETED
Phase 8   — Customers Module                          ✅ COMPLETED
Phase 9   — Dashboard Analytics                       ✅ COMPLETED
Phase 10  — Notifications Center                      ✅ COMPLETED
Phase 11  — Automations MVP                           ✅ COMPLETED
Phase 12  — Settings Module                           ⏭️ NEXT
Phase 12.5— AI Assistants                             ⏳ PENDING
Phase 13  — Webhooks & Incremental Sync               ⏳ PENDING
Phase 13.5— Audit Logs                                ⏳ PENDING
Phase 14  — QA, Permissions & Production Readiness    ⏳ PENDING
```

> Note: Products Module (Phase 5) was intentionally built before WooCommerce Sync (Phase 6) so the dashboard had a working product surface and publish foundation first.

---

# MVP Success Definition

The MVP is successful when a store owner can:

1. Register an account.
2. Create/connect a WooCommerce store.
3. Install the WordPress connector plugin.
4. Sync products, orders, and customers.
5. View sales dashboard.
6. Add/edit/publish products from the SaaS dashboard.
7. View orders and customers.
8. Invite employees and assign roles.
9. Receive system notifications for orders, low stock, and failed syncs.
10. Enable basic automations.
11. Use the system in Arabic RTL with light/dark mode.

