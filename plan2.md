# plan2.md — Digital Products & License Code Management Expansion

> This file extends the completed SaaS E-commerce Operations Dashboard MVP described in `plan.md`.
> The original platform already has auth, tenants, RBAC, WooCommerce connector, sync, products, orders, customers, analytics, notifications, automations, AI, webhooks, audit logs, and production readiness through Phase 14.
>
> This `plan2.md` is the detailed implementation plan for turning the current WooCommerce operations dashboard into a serious digital-products operations system suitable for stores like **sho9.com**, where the product sold is usually a code, key, account, subscription, activation, or other digital entitlement.

---

# 0. Executive Summary

## Current System

The current system is a SaaS dashboard connected to WordPress/WooCommerce through a lightweight connector plugin.

Current architecture:

```txt
React Dashboard
      ↓
Express API
      ↓
PostgreSQL / Redis / BullMQ
      ↓
WordPress Connector Plugin
      ↓
WooCommerce
```

The existing MVP is built for normal WooCommerce operations:

- Products
- Orders
- Customers
- Dashboard analytics
- Notifications
- Automations
- Webhooks
- Audit logs
- AI assistants
- Settings
- Roles and permissions

## New Goal

The new goal is to support **digital product fulfillment**:

- License keys
- Gift card codes
- Subscription codes
- Activation codes
- Digital accounts
- Replacement codes
- Supplier batches
- Automatic delivery after payment
- Digital inventory tracking
- Code reservation and assignment
- Delivery history
- Failed delivery handling
- Manual resend
- Refund/replacement workflows
- Customer self-service code display
- Stock risk monitoring
- Profit and supplier analytics

The most important concept:

```txt
A WooCommerce product can have a digital inventory pool.
Each pool contains many secret codes.
When an order is paid, the SaaS assigns/reserves/sells one or more codes and delivers them to the customer.
```

---

# 1. Critical Development Rules

Claude must follow these rules exactly.

## 1.1 General Rules

- Read `plan.md` first.
- Read `plan2.md` second.
- Do not rebuild features already completed in `plan.md`.
- Implement one phase at a time only.
- Do not jump to future phases.
- Do not add features outside the current phase.
- Preserve existing architecture.
- Keep the WordPress plugin thin.
- Keep business logic in the SaaS backend, not in WordPress.
- Keep everything tenant-scoped by `store_id`.
- Keep Arabic RTL as the first UI language.
- Keep light/dark mode support.
- Preserve existing API envelope shape.
- Preserve existing RBAC style.
- Preserve existing audit-log approach.
- Preserve existing notification creation seam.
- Never expose raw secrets, codes, API keys, tokens, passwords, or customer private data in logs.
- Never log full digital codes.
- Never return codes in list endpoints unless the endpoint is explicitly a secure reveal endpoint.

## 1.2 Security Rules for Digital Codes

Digital codes are money. Treat them as sensitive financial inventory.

- Store raw code values encrypted at rest.
- Never store raw code values in plaintext columns.
- Never show full codes in list tables.
- Mask codes by default.
- Reveal full code only through a dedicated endpoint with a strict permission.
- Every reveal must be audit-logged.
- Every import must be audit-logged.
- Every assignment/reservation/sale/replacement must be audit-logged.
- Exports must be restricted and audit-logged.
- Code deletion should be avoided; use status changes instead.
- Use transactions around reservation/assignment.
- Use row-level locking or equivalent atomic update to prevent double-selling.
- Duplicate codes must be detected by a secure hash/fingerprint, not by decrypting everything.
- Never send full codes to external systems except approved delivery channels.

## 1.3 WordPress Plugin Rules

The connector plugin should only:

- Detect WooCommerce events.
- Normalize WooCommerce payloads.
- Send webhooks to the SaaS.
- Receive publish/update requests from SaaS.
- Optionally store order meta showing digital delivery status.
- Optionally display safe delivery status in WooCommerce admin.

The connector plugin must not:

- Manage code inventory.
- Store codes.
- Assign codes.
- Implement delivery rules.
- Contain heavy business logic.

## 1.4 Code Quality Rules

- Follow existing module shape:
  - `schemas`
  - `serializer`
  - `service`
  - `controller`
  - `routes`
  - unit tests
- Keep database migrations incremental.
- Add indexes for tenant-scoped queries.
- Add tests for serializers and critical business rules.
- Add transactional tests where possible.
- Use Zod validation at API boundaries.
- Use existing error handling conventions.
- Use existing `requirePermission` middleware.
- Use existing `recordAuditFromRequest` / `recordAuditLog` pattern.
- Use existing `createNotification` seam.
- Use existing queue registration style.

---

# 2. New Product Model Concepts

## 2.1 Digital Product Types

A product can be one of these fulfillment types:

```txt
manual
license_key
gift_card_code
subscription_code
account_credentials
file_or_link
service_activation
```

For MVP digital fulfillment, implement these first:

```txt
license_key
subscription_code
gift_card_code
```

Defer these unless explicitly requested later:

```txt
account_credentials
file_or_link
service_activation
```

## 2.2 Product Digital Settings

Each SaaS product can optionally have digital fulfillment settings:

```txt
is_digital_fulfillment_enabled
fulfillment_type
delivery_mode
auto_delivery_enabled
code_pool_strategy
reserve_on_statuses
deliver_on_statuses
allow_manual_assignment
allow_replacement
low_stock_threshold
max_codes_per_order_item
instructions_template
```

Recommended defaults:

```txt
is_digital_fulfillment_enabled = false
fulfillment_type = license_key
delivery_mode = automatic
code_pool_strategy = fifo
reserve_on_statuses = processing,on-hold,completed
deliver_on_statuses = processing,completed
allow_manual_assignment = true
allow_replacement = true
low_stock_threshold = 5
max_codes_per_order_item = 50
instructions_template = null
```

## 2.3 Code Statuses

Each code must have one clear status.

Canonical statuses:

```txt
available
reserved
sold
delivered
replacement
voided
invalid
refunded
expired
```

Recommended lifecycle:

```txt
available
  ↓
reserved
  ↓
sold
  ↓
delivered
```

Exception lifecycle:

```txt
delivered
  ↓
replacement

available/reserved/sold/delivered
  ↓
voided / invalid / refunded / expired
```

Status meaning:

| Status | Meaning |
|---|---|
| available | Code exists and can be assigned. |
| reserved | Temporarily held for an order to prevent double-selling. |
| sold | Assigned to a paid order but not necessarily delivered yet. |
| delivered | Sent/displayed to customer. |
| replacement | Used as replacement for a previous failed/invalid code. |
| voided | Removed from sale intentionally. |
| invalid | Supplier-provided code is bad or rejected. |
| refunded | Order/code was refunded. |
| expired | Code expired before sale or use. |

## 2.4 Delivery Statuses

Order-level or item-level digital delivery status:

```txt
not_required
pending
reserved
partial
completed
failed
manual_review
cancelled
refunded
```

## 2.5 Assignment Rule

For each paid order item:

```txt
required_codes = order_item.quantity
```

Example:

```txt
Customer buys 3 Netflix subscription codes
System assigns 3 available codes from the product pool
```

If not enough codes exist:

```txt
Order digital delivery status = partial or failed
Create notification
Create automation log
Keep order visible in manual review queue
```

---

# 3. New Permissions

Add these permissions to the RBAC catalog.

```txt
digital_inventory.view
digital_inventory.import
digital_inventory.edit
digital_inventory.delete
digital_inventory.reveal
digital_inventory.export
digital_delivery.view
digital_delivery.assign
digital_delivery.resend
digital_delivery.replace
digital_delivery.refund
digital_suppliers.view
digital_suppliers.create
digital_suppliers.edit
digital_suppliers.delete
digital_reports.view
```

## 3.1 Suggested Role Grants

| Role | Permissions |
|---|---|
| Owner | all permissions |
| Manager | all digital permissions except dangerous export/delete if desired |
| Product Manager | view/import/edit inventory, suppliers view/create/edit, reports view |
| Order Employee | delivery view/assign/resend/replace, inventory view masked |
| Customer Support | delivery view/resend/replace, inventory view masked |
| Marketer | digital reports view only |
| Accountant | digital reports view only |
| Viewer | digital inventory view masked, digital delivery view |

Important:

- `digital_inventory.reveal` must be restricted.
- `digital_inventory.export` must be restricted.
- `digital_inventory.delete` should rarely be used; prefer voiding codes.

---

# 4. Database Design

## 4.1 New Tables Overview

Add these tables over multiple phases:

```txt
digital_product_settings
code_batches
digital_codes
code_assignments
digital_deliveries
delivery_attempts
suppliers
supplier_products
code_reservations
customer_code_views
```

Some can be added later depending on phase.

---

## 4.2 Table: digital_product_settings

One row per store/product when digital fulfillment is enabled or configured.

Fields:

```txt
id uuid primary key
store_id uuid not null references stores(id) on delete cascade
product_id uuid not null references products(id) on delete cascade
fulfillment_type text not null
is_enabled boolean not null default false
auto_delivery_enabled boolean not null default true
delivery_mode text not null default 'automatic'
code_pool_strategy text not null default 'fifo'
reserve_on_statuses text[] not null default array['processing','on-hold','completed']
deliver_on_statuses text[] not null default array['processing','completed']
allow_manual_assignment boolean not null default true
allow_replacement boolean not null default true
low_stock_threshold integer not null default 5
max_codes_per_order_item integer not null default 50
instructions_template text null
metadata jsonb not null default '{}'
created_at timestamp not null default now()
updated_at timestamp not null default now()
```

Unique index:

```txt
unique(store_id, product_id)
```

Indexes:

```txt
(store_id, is_enabled)
(store_id, fulfillment_type)
(product_id)
```

Validation:

- `fulfillment_type` in allowed list.
- `delivery_mode` in `automatic`, `manual`, `review_first`.
- `code_pool_strategy` in `fifo`, `lifo`, `earliest_expiry`, `random`.
- `low_stock_threshold >= 0`.
- `max_codes_per_order_item >= 1 and <= 500`.

---

## 4.3 Table: suppliers

Supplier/vendor records for code source tracking.

Fields:

```txt
id uuid primary key
store_id uuid not null references stores(id) on delete cascade
name text not null
contact_name text null
email text null
phone text null
website text null
country text null
currency text null
notes text null
status text not null default 'active'
created_at timestamp not null default now()
updated_at timestamp not null default now()
```

Statuses:

```txt
active
paused
archived
```

Indexes:

```txt
(store_id, status)
(store_id, name)
```

---

## 4.4 Table: supplier_products

Optional mapping between supplier and products they provide.

Fields:

```txt
id uuid primary key
store_id uuid not null references stores(id) on delete cascade
supplier_id uuid not null references suppliers(id) on delete cascade
product_id uuid not null references products(id) on delete cascade
supplier_sku text null
cost_price numeric(12,2) null
currency text null
min_order_quantity integer null
lead_time_days integer null
notes text null
created_at timestamp not null default now()
updated_at timestamp not null default now()
```

Unique index:

```txt
unique(store_id, supplier_id, product_id)
```

---

## 4.5 Table: code_batches

A batch is a group of imported codes.

Fields:

```txt
id uuid primary key
store_id uuid not null references stores(id) on delete cascade
product_id uuid not null references products(id) on delete cascade
supplier_id uuid null references suppliers(id) on delete set null
batch_name text null
source text not null default 'manual_import'
import_file_name text null
quantity_total integer not null default 0
quantity_available integer not null default 0
quantity_reserved integer not null default 0
quantity_sold integer not null default 0
quantity_delivered integer not null default 0
quantity_invalid integer not null default 0
cost_total numeric(12,2) null
cost_per_code numeric(12,4) null
currency text null
expires_at timestamp null
notes text null
status text not null default 'active'
created_by uuid null references users(id) on delete set null
created_at timestamp not null default now()
updated_at timestamp not null default now()
```

Statuses:

```txt
active
paused
consumed
archived
```

Indexes:

```txt
(store_id, product_id)
(store_id, supplier_id)
(store_id, status)
(store_id, created_at, id)
```

Important:

- Batch counters can be computed live at first for correctness.
- If counters are stored, update them transactionally.
- Do not rely on counters for security-critical assignment. Use `digital_codes` rows.

---

## 4.6 Table: digital_codes

This is the core inventory table.

Fields:

```txt
id uuid primary key
store_id uuid not null references stores(id) on delete cascade
product_id uuid not null references products(id) on delete cascade
batch_id uuid null references code_batches(id) on delete set null
supplier_id uuid null references suppliers(id) on delete set null
code_cipher text not null
code_iv text not null
code_tag text not null
code_hash text not null
code_preview text null
status text not null default 'available'
reserved_until timestamp null
assigned_order_id uuid null references orders(id) on delete set null
assigned_order_item_id uuid null references order_items(id) on delete set null
assigned_customer_id uuid null references customers(id) on delete set null
sold_at timestamp null
delivered_at timestamp null
expires_at timestamp null
cost_price numeric(12,4) null
currency text null
metadata jsonb not null default '{}'
created_by uuid null references users(id) on delete set null
created_at timestamp not null default now()
updated_at timestamp not null default now()
```

Unique index:

```txt
unique(store_id, product_id, code_hash)
```

Important indexes:

```txt
(store_id, product_id, status)
(store_id, batch_id)
(store_id, supplier_id)
(store_id, assigned_order_id)
(store_id, assigned_customer_id)
(store_id, expires_at)
(store_id, created_at, id)
```

Security:

- `code_hash` is a keyed HMAC/fingerprint used for duplicate detection.
- `code_preview` is safe masked preview only, like `ABCD••••7890`.
- Do not store raw code.
- Full code reveal requires decrypt permission and audit logging.

Allowed statuses:

```txt
available
reserved
sold
delivered
replacement
voided
invalid
refunded
expired
```

---

## 4.7 Table: code_assignments

Tracks which code was assigned to which order item.

Fields:

```txt
id uuid primary key
store_id uuid not null references stores(id) on delete cascade
code_id uuid not null references digital_codes(id) on delete restrict
product_id uuid not null references products(id) on delete cascade
order_id uuid not null references orders(id) on delete cascade
order_item_id uuid not null references order_items(id) on delete cascade
customer_id uuid null references customers(id) on delete set null
assignment_type text not null default 'sale'
status text not null default 'assigned'
assigned_by uuid null references users(id) on delete set null
assigned_at timestamp not null default now()
delivered_at timestamp null
replaced_by_assignment_id uuid null references code_assignments(id) on delete set null
notes text null
metadata jsonb not null default '{}'
created_at timestamp not null default now()
updated_at timestamp not null default now()
```

Assignment types:

```txt
sale
manual
replacement
resend
```

Statuses:

```txt
assigned
delivered
replaced
refunded
cancelled
failed
```

Unique protection:

```txt
unique(store_id, code_id) where status in ('assigned','delivered')
```

Indexes:

```txt
(store_id, order_id)
(store_id, order_item_id)
(store_id, customer_id)
(store_id, product_id)
(store_id, created_at, id)
```

---

## 4.8 Table: digital_deliveries

Represents a delivery package for an order.

Fields:

```txt
id uuid primary key
store_id uuid not null references stores(id) on delete cascade
order_id uuid not null references orders(id) on delete cascade
customer_id uuid null references customers(id) on delete set null
status text not null default 'pending'
channel text not null default 'dashboard'
recipient_email text null
recipient_phone text null
subject text null
message_preview text null
attempt_count integer not null default 0
last_attempt_at timestamp null
completed_at timestamp null
failed_reason text null
created_by uuid null references users(id) on delete set null
created_at timestamp not null default now()
updated_at timestamp not null default now()
```

Statuses:

```txt
pending
processing
completed
failed
cancelled
manual_review
```

Channels:

```txt
dashboard
email
whatsapp
woocommerce_note
manual
```

Indexes:

```txt
(store_id, order_id)
(store_id, status)
(store_id, created_at, id)
```

---

## 4.9 Table: delivery_attempts

Each send/reveal/resend attempt.

Fields:

```txt
id uuid primary key
store_id uuid not null references stores(id) on delete cascade
delivery_id uuid not null references digital_deliveries(id) on delete cascade
order_id uuid not null references orders(id) on delete cascade
channel text not null
status text not null
provider text null
provider_message_id text null
error_code text null
error_message text null
metadata jsonb not null default '{}'
created_at timestamp not null default now()
```

Statuses:

```txt
queued
sent
failed
skipped
```

Indexes:

```txt
(store_id, delivery_id, created_at, id)
(store_id, order_id)
(store_id, status)
```

---

## 4.10 Table: customer_code_views

Tracks customer or staff views of delivered codes.

Fields:

```txt
id uuid primary key
store_id uuid not null references stores(id) on delete cascade
code_id uuid not null references digital_codes(id) on delete cascade
assignment_id uuid null references code_assignments(id) on delete set null
order_id uuid null references orders(id) on delete set null
customer_id uuid null references customers(id) on delete set null
viewer_user_id uuid null references users(id) on delete set null
viewer_type text not null
ip_address text null
user_agent text null
created_at timestamp not null default now()
```

Viewer types:

```txt
staff
customer
system
```

Indexes:

```txt
(store_id, code_id)
(store_id, order_id)
(store_id, customer_id)
(store_id, created_at, id)
```

---

# 5. Encryption and Hashing Design

## 5.1 Required Environment Variables

Add to API `.env.example`:

```txt
DIGITAL_CODES_ENCRYPTION_KEY=
DIGITAL_CODES_HASH_KEY=
DIGITAL_CODES_REVEAL_RATE_LIMIT_ENABLED=true
DIGITAL_CODES_REVEAL_RATE_LIMIT_WINDOW_SECONDS=60
DIGITAL_CODES_REVEAL_RATE_LIMIT_MAX=20
```

Requirements:

- `DIGITAL_CODES_ENCRYPTION_KEY` must be 32 bytes when decoded, same standard as connector encryption.
- `DIGITAL_CODES_HASH_KEY` must be strong random secret.
- API must refuse to boot in production if these are missing when digital module is enabled.

## 5.2 Encryption

Use AES-256-GCM.

Store:

```txt
code_cipher
code_iv
code_tag
```

Never store raw code.

## 5.3 Hash/Fingerprint

Use HMAC-SHA256:

```txt
code_hash = HMAC_SHA256(DIGITAL_CODES_HASH_KEY, normalize(code))
```

Normalization:

- Trim whitespace.
- Normalize line endings.
- Preserve case by default unless product setting says case-insensitive.
- Do not remove hyphens unless explicitly configured later.

## 5.4 Preview

Create safe preview:

```txt
ABCD••••WXYZ
```

Rules:

- If code length <= 8, show only first 2 and last 2.
- If code length > 8, show first 4 and last 4.
- Never expose full code in preview.

---

# 6. API Response Rules

Follow existing response envelope:

Success:

```json
{
  "success": true,
  "data": {},
  "message": ""
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": ""
  }
}
```

## 6.1 Common Error Codes

```txt
DIGITAL_PRODUCT_NOT_ENABLED
CODE_NOT_FOUND
CODE_ALREADY_EXISTS
CODE_NOT_AVAILABLE
INSUFFICIENT_CODES
ORDER_NOT_ELIGIBLE
DELIVERY_ALREADY_COMPLETED
DELIVERY_FAILED
REVEAL_NOT_ALLOWED
EXPORT_NOT_ALLOWED
INVALID_IMPORT_FILE
SUPPLIER_NOT_FOUND
BATCH_NOT_FOUND
```

---

# 7. Frontend Navigation Additions

Add sidebar items only when user has permission.

Arabic labels:

```txt
المخزون الرقمي
تسليم الأكواد
دفعات الأكواد
الموردين
تقارير الأكواد
```

Recommended routes:

```txt
/digital-inventory
/digital-inventory/batches
/digital-inventory/batches/:id
/digital-inventory/codes/:id
/digital-delivery
/digital-delivery/orders/:orderId
/suppliers
/suppliers/:id
/digital-reports
```

---

# 8. Implementation Phase Status

> Status audited 2026-06-27 against the actual codebase (API typecheck/lint clean, 288 unit tests passing; dashboard build/lint clean). See [docs/status.md](docs/status.md) for the detailed per-phase audit. Legend: ✅ COMPLETED · 🟡 PARTIAL (backend done, frontend/secondary gaps) · ⏳ PENDING.

| Phase | Name | Status |
|---|---|---|
| 15 | Digital Product Foundation | ✅ COMPLETED |
| 16 | Code Inventory & Secure Import | ✅ COMPLETED |
| 17 | Code Assignment & Reservation Engine | 🟡 PARTIAL — backend complete; frontend (queue + order section) missing |
| 18 | Automatic Digital Delivery | 🟡 PARTIAL — backend complete; frontend missing; `/resend` named `/retry` |
| 19 | Manual Fulfillment, Resend & Replacement | 🟡 PARTIAL — backend partial; frontend missing; some endpoints/audits/webhook gaps |
| 20 | Suppliers & Batch Cost Tracking | 🟡 PARTIAL — backend complete; suppliers UI + behavioral tests missing |
| 21 | Digital Reports & Profit Analytics | 🟡 PARTIAL — backend + frontend + tests present (already started ahead of audit) |
| 22 | Customer Self-Service Code Access | ✅ COMPLETED (code-complete; live QA pending deploy) |
| 23 | Digital Automations Expansion | ✅ COMPLETED (code-complete; live QA pending deploy) |
| 24 | Digital QA, Security Audit & Pilot Readiness | ⏳ PENDING |

---

# Phase 15 — Digital Product Foundation ⏳ PENDING

## Goal

Add the foundation that allows a normal synced WooCommerce product to be configured as a digital product with code-based fulfillment.

This phase does **not** import codes yet and does **not** assign codes yet.

## Scope

Build:

- Product digital settings table.
- Product digital settings backend module.
- Product details UI section for digital fulfillment.
- Product list indicator for digital products.
- RBAC permissions.
- Audit logs for settings changes.

Do not build:

- Code inventory table.
- Import flow.
- Assignment engine.
- Delivery engine.
- Supplier management.

## Database

Add migration `0012_digital_product_settings` or next available number.

Create table:

```txt
digital_product_settings
```

Fields exactly as defined in section 4.2.

## Permissions

Add permissions:

```txt
digital_inventory.view
digital_inventory.edit
```

Grant:

- Owner: both
- Manager: both
- Product Manager: both
- Order Employee: view only
- Customer Support: view only
- Viewer: view only

## Backend Endpoints

```txt
GET   /products/:id/digital-settings
PATCH /products/:id/digital-settings
```

Alternative acceptable route if project prefers module grouping:

```txt
GET   /digital-products/:productId/settings
PATCH /digital-products/:productId/settings
```

Use whichever matches existing route style better, but keep it consistent.

## Backend Validation

PATCH body:

```json
{
  "is_enabled": true,
  "fulfillment_type": "license_key",
  "auto_delivery_enabled": true,
  "delivery_mode": "automatic",
  "code_pool_strategy": "fifo",
  "reserve_on_statuses": ["processing", "completed"],
  "deliver_on_statuses": ["processing", "completed"],
  "allow_manual_assignment": true,
  "allow_replacement": true,
  "low_stock_threshold": 5,
  "max_codes_per_order_item": 50,
  "instructions_template": ""
}
```

Rules:

- Product must belong to current store.
- Product must not be archived.
- Unknown keys rejected.
- Empty body rejected.
- Status arrays must only contain valid WooCommerce order statuses.
- `deliver_on_statuses` should normally be subset of or compatible with `reserve_on_statuses`; if not, reject.
- `max_codes_per_order_item` must be >= 1.

## Backend Service Behavior

`getDigitalSettings(storeId, productId)`:

- Validate product exists in store.
- Return existing settings if found.
- Otherwise return default settings DTO without necessarily creating row.

`updateDigitalSettings(storeId, productId, input, actor)`:

- Validate product exists.
- Upsert one row per store/product.
- Normalize input.
- Record audit log with changed field names only.
- Return serialized settings.

## Frontend UI

Add a section inside product details or edit page:

Arabic title:

```txt
إعدادات المنتج الرقمي
```

Fields:

- تفعيل التسليم الرقمي
- نوع التسليم
- تفعيل التسليم التلقائي
- طريقة التسليم
- استراتيجية اختيار الكود
- حالات حجز الكود
- حالات إرسال الكود
- السماح بالتعيين اليدوي
- السماح بالاستبدال
- حد تنبيه انخفاض الأكواد
- أقصى عدد أكواد في عنصر الطلب
- تعليمات تظهر مع الكود

Arabic option labels:

Fulfillment type:

```txt
license_key = مفتاح تفعيل
subscription_code = كود اشتراك
gift_card_code = كود بطاقة رقمية
```

Delivery mode:

```txt
automatic = تلقائي
manual = يدوي
review_first = مراجعة قبل الإرسال
```

Pool strategy:

```txt
fifo = الأقدم أولاً
lifo = الأحدث أولاً
earliest_expiry = الأقرب انتهاءً أولاً
random = عشوائي
```

## Product List UI

Add safe indicator/badge:

```txt
رقمي
```

Only show if product has digital settings enabled.

## Audit Logs

Action:

```txt
digital_product_settings_updated
```

Entity type:

```txt
product
```

Metadata allowed:

```json
{
  "changedFields": ["is_enabled", "fulfillment_type"],
  "productId": "..."
}
```

Do not log instructions template body if it may contain sensitive content. Log only that it changed.

## Tests

Add unit tests for:

- Schema validation.
- Serializer default output.
- Reject invalid fulfillment type.
- Reject invalid statuses.
- Reject cross-store product access if service tests allow.
- Audit metadata does not include template body.

## Acceptance Criteria

- A user with permission can enable digital fulfillment on a product.
- A user without edit permission cannot change settings.
- Product list/detail shows a digital badge.
- Settings persist after refresh.
- Tenant isolation is preserved.
- Audit log is written without sensitive data.
- No code inventory or delivery logic is implemented in this phase.

## Final Report Required

```txt
Phase Completed: Phase 15 — Digital Product Foundation

Implemented:
- ...

Files Created:
- ...

Files Modified:
- ...

Checks Run:
- ...

Notes / Remaining:
- Code inventory begins in Phase 16.
```

---

# Phase 16 — Code Inventory & Secure Import ⏳ PENDING

## Goal

Build secure inventory for digital codes and allow staff to import codes into product-specific pools.

This phase creates and manages code stock but does **not** assign codes to orders yet.

## Scope

Build:

- `code_batches`
- `digital_codes`
- Encryption helpers
- Hash/fingerprint helpers
- Batch import endpoint
- Inventory list endpoints
- Secure reveal endpoint
- Digital inventory UI
- Batch details UI
- Duplicate detection
- Audit logs

Do not build:

- Order assignment
- Delivery
- Supplier UI unless needed minimally
- Customer access

## Database

Add migration `0013_code_inventory` or next available number.

Create tables:

```txt
code_batches
digital_codes
```

Use definitions from sections 4.5 and 4.6.

## Permissions

Add:

```txt
digital_inventory.import
digital_inventory.reveal
digital_inventory.export
digital_inventory.delete
```

Grant:

- Owner: all
- Manager: view/import/edit/reveal/export
- Product Manager: view/import/edit
- Order Employee: view only
- Customer Support: view only
- Viewer: view only

Do not grant reveal/export to low-level roles by default.

## Encryption Helpers

Create helpers in API:

```txt
src/lib/digital-code-crypto.ts
```

Functions:

```ts
encryptDigitalCode(rawCode: string): EncryptedCode
decryptDigitalCode(encrypted: EncryptedCode): string
hashDigitalCode(rawCode: string): string
makeCodePreview(rawCode: string): string
normalizeDigitalCode(rawCode: string): string
```

Rules:

- Use AES-256-GCM.
- Use HMAC-SHA256 for hash.
- Throw safe internal error if keys missing.
- Do not log raw code on error.

## Backend Endpoints

```txt
GET  /digital-inventory/summary
GET  /digital-inventory/codes
GET  /digital-inventory/codes/:id
POST /digital-inventory/import
POST /digital-inventory/codes/:id/reveal
PATCH /digital-inventory/codes/:id/status
GET  /digital-inventory/batches
GET  /digital-inventory/batches/:id
```

## Endpoint Details

### GET /digital-inventory/summary

Query:

```txt
productId optional
```

Return:

```json
{
  "totalCodes": 120,
  "available": 80,
  "reserved": 5,
  "sold": 20,
  "delivered": 10,
  "invalid": 3,
  "voided": 2,
  "lowStockProducts": []
}
```

### GET /digital-inventory/codes

Query filters:

```txt
productId
batchId
status
search
page
limit
```

Search must **not** decrypt codes.
Search can match:

- code preview
- product title
- batch name
- metadata if safe

Return masked only:

```json
{
  "items": [
    {
      "id": "...",
      "productId": "...",
      "productName": "Netflix 1 Month",
      "batchId": "...",
      "batchName": "June Batch",
      "codePreview": "ABCD••••WXYZ",
      "status": "available",
      "expiresAt": null,
      "createdAt": "..."
    }
  ],
  "pagination": {}
}
```

### POST /digital-inventory/import

Input:

```json
{
  "productId": "...",
  "batchName": "June supplier batch",
  "codesText": "CODE-1\nCODE-2\nCODE-3",
  "source": "manual_import",
  "costPerCode": 2.5,
  "currency": "USD",
  "expiresAt": null,
  "notes": "optional"
}
```

Also allow CSV later if existing stack supports upload. MVP can start with textarea import.

Rules:

- Product must belong to store.
- Product must have digital fulfillment enabled.
- Split by line.
- Trim empty lines.
- Reject if no valid codes.
- Max codes per request should be configurable, default 5000.
- Detect duplicates within uploaded batch.
- Detect duplicates already in DB by `code_hash`.
- Insert only unique valid codes.
- Return counts:

```json
{
  "batchId": "...",
  "received": 100,
  "inserted": 95,
  "duplicatesInFile": 3,
  "duplicatesExisting": 2,
  "invalid": 0
}
```

### POST /digital-inventory/codes/:id/reveal

Rules:

- Requires `digital_inventory.reveal`.
- Rate limited.
- Code must belong to store.
- Audit log must be written.
- Return full code once in response.
- Do not cache.

Response:

```json
{
  "id": "...",
  "code": "FULL-CODE-HERE",
  "revealedAt": "..."
}
```

### PATCH /digital-inventory/codes/:id/status

Allowed manual transitions:

```txt
available -> voided
available -> invalid
reserved -> voided only if reservation expired or admin override
sold -> invalid only with reason
sold/delivered -> refunded only through later refund workflow; do not implement direct if risky
```

Input:

```json
{
  "status": "invalid",
  "reason": "Supplier said this code is invalid"
}
```

Require reason for destructive statuses:

```txt
voided
invalid
refunded
expired
```

## Frontend Pages

### /digital-inventory

Arabic title:

```txt
المخزون الرقمي
```

Sections:

- Summary cards:
  - إجمالي الأكواد
  - المتاح
  - المحجوز
  - المباع
  - المسلم
  - غير صالح
- Filters:
  - المنتج
  - الحالة
  - الدفعة
  - البحث
- Table:
  - المنتج
  - معاينة الكود
  - الحالة
  - الدفعة
  - تاريخ الانتهاء
  - تاريخ الإضافة
  - إجراءات

Actions:

- عرض التفاصيل
- كشف الكود، only if permission
- تغيير الحالة، only if permission

### /digital-inventory/batches

Table:

- اسم الدفعة
- المنتج
- المورد، if exists
- إجمالي الأكواد
- المتاح
- المباع
- التكلفة
- الحالة
- تاريخ الإضافة

### Import Dialog/Page

Arabic fields:

- المنتج
- اسم الدفعة
- الأكواد، كل كود في سطر
- تكلفة الكود
- العملة
- تاريخ الانتهاء
- ملاحظات

After import show:

- تم استلام
- تم إضافة
- مكرر داخل الملف
- مكرر موجود مسبقاً
- غير صالح

## Audit Logs

Actions:

```txt
digital_codes_imported
digital_code_revealed
digital_code_status_updated
digital_batch_created
```

Never log raw code.

Allowed metadata:

```json
{
  "productId": "...",
  "batchId": "...",
  "inserted": 95,
  "duplicates": 5,
  "codeId": "...",
  "fromStatus": "available",
  "toStatus": "invalid"
}
```

## Notifications

Create notification when:

- Import inserted 0 codes due to duplicates/invalid.
- Product is still below threshold after import.

Notification types can reuse `low_stock` or add:

```txt
digital_inventory
```

Prefer add generic type if notification constants are easy to extend.

## Tests

Add tests for:

- Crypto encrypt/decrypt roundtrip.
- Same raw code produces same hash.
- Preview never equals raw code.
- Import detects duplicates in same file.
- Import detects duplicates in DB.
- List endpoint never returns full code.
- Reveal requires permission.
- Reveal audit log does not include code.
- Status transition validation.

## Acceptance Criteria

- Staff can import codes into a digital product.
- Codes are encrypted at rest.
- Duplicate codes are blocked.
- Codes can be listed only as masked previews.
- Full code reveal requires strict permission and audit log.
- Inventory summary is accurate.
- Tenant isolation is preserved.
- No order assignment or delivery is implemented yet.

---

# Phase 17 — Code Assignment & Reservation Engine ⏳ PENDING

## Goal

Build the backend engine that reserves and assigns codes to WooCommerce order items safely.

This is the most critical phase because it prevents double-selling.

## Scope

Build:

- `code_assignments`
- Optional `code_reservations` if needed, otherwise use `digital_codes.reserved_until`
- Transactional reservation engine
- Assignment service
- Order digital status calculation
- Manual internal endpoint to assign codes to order
- Integration seam for webhooks/order status changes

Do not build:

- Actual customer delivery
- Email/WhatsApp sending
- Customer self-service

## Database

Add migration `0014_code_assignments`.

Create:

```txt
code_assignments
```

Optionally add columns to `orders`:

```txt
digital_delivery_status text not null default 'not_required'
digital_delivery_required boolean not null default false
digital_delivery_completed_at timestamp null
```

Optionally add columns to `order_items`:

```txt
digital_codes_required integer null
digital_codes_assigned integer not null default 0
```

If avoiding schema change on existing tables, create a separate table:

```txt
order_digital_statuses
```

But preferred: extend `orders` and `order_items` if consistent with existing project style.

## Core Algorithm

Function:

```ts
assignCodesForOrder(storeId: string, orderId: string, options?: AssignOptions)
```

Steps:

1. Load order by `store_id` and `order_id`.
2. Load order items.
3. For each item:
   - Find product digital settings.
   - If not enabled, skip item.
   - Required quantity = order item quantity.
   - Already assigned quantity = count active assignments for that item.
   - Missing quantity = required - assigned.
4. If missing quantity <= 0, skip.
5. Select available codes for product using configured pool strategy.
6. Lock selected rows transactionally.
7. If available codes < missing quantity:
   - Assign what is available only if partial mode allowed, otherwise fail.
   - Mark order digital status partial/failed/manual_review.
   - Create notification.
8. Update selected codes:
   - status = sold or reserved depending lifecycle choice.
   - assigned order/customer fields.
   - sold_at = now.
9. Insert code_assignments.
10. Update order digital delivery status.
11. Record audit log.
12. Return assignment summary.

## Concurrency Requirement

Must prevent two workers assigning same code.

Preferred SQL strategy:

```sql
SELECT id
FROM digital_codes
WHERE store_id = ?
  AND product_id = ?
  AND status = 'available'
ORDER BY created_at ASC
LIMIT ?
FOR UPDATE SKIP LOCKED
```

If ORM makes this hard:

- Use raw SQL only for this critical selection.
- Keep rest in Drizzle.

## Pool Strategies

Implement:

```txt
fifo = order by created_at asc
lifo = order by created_at desc
earliest_expiry = order by expires_at asc nulls last, created_at asc
random = order by random()
```

## Backend Endpoints

```txt
POST /digital-delivery/orders/:orderId/assign
GET  /digital-delivery/orders/:orderId/assignments
GET  /digital-delivery/queue
```

### POST /digital-delivery/orders/:orderId/assign

Requires:

```txt
digital_delivery.assign
```

Input:

```json
{
  "mode": "auto",
  "allowPartial": true,
  "reason": "Manual assignment from dashboard"
}
```

Response:

```json
{
  "orderId": "...",
  "status": "completed",
  "requiredCodes": 3,
  "assignedCodes": 3,
  "items": [
    {
      "orderItemId": "...",
      "productId": "...",
      "required": 3,
      "assigned": 3,
      "missing": 0
    }
  ]
}
```

### GET /digital-delivery/queue

Shows orders requiring digital attention.

Filters:

```txt
status=pending|partial|failed|manual_review|completed
search
page
limit
```

Return:

- order number
- customer
- status
- required codes
- assigned codes
- created date
- actions

## Webhook Integration

When order webhook is processed and order status is in product settings `reserve_on_statuses`, call assignment engine.

Important:

- Do not deliver codes yet.
- Only assign/reserve them.
- Create notification if assignment fails.

Potential action:

```txt
order_webhook_processed -> maybeAssignCodesForOrder
```

Avoid duplicate assignment by checking existing assignments.

## Audit Logs

Actions:

```txt
digital_codes_assigned
digital_assignment_failed
digital_assignment_partial
```

Metadata allowed:

```json
{
  "orderId": "...",
  "requiredCodes": 3,
  "assignedCodes": 2,
  "productIds": ["..."]
}
```

No raw codes.

## Notifications

Create notifications:

- Insufficient codes.
- Assignment failed.
- Manual review required.

Notification titles in Arabic:

```txt
لا توجد أكواد كافية
فشل تعيين الأكواد
طلب يحتاج مراجعة يدوية
```

## Frontend

### /digital-delivery

Arabic title:

```txt
تسليم الأكواد
```

Queue table:

- رقم الطلب
- العميل
- حالة الطلب
- حالة التسليم الرقمي
- الأكواد المطلوبة
- الأكواد المعينة
- تاريخ الطلب
- إجراءات

Actions:

- فتح الطلب
- تعيين الأكواد

### Order details integration

On `/orders/:id`, add digital fulfillment section if order has digital items.

Show:

- حالة التسليم الرقمي
- الأكواد المطلوبة
- الأكواد المعينة
- زر تعيين الأكواد
- assignments masked list

Do not show full codes unless reveal permission and explicit reveal action.

## Tests

Add tests for:

- Assign exact quantity.
- Do not assign duplicate on repeated call.
- Insufficient inventory.
- Partial assignment.
- Pool strategy order.
- Cross-store isolation.
- Concurrency if possible with transaction/integration test.
- Webhook order processed triggers assignment only for eligible statuses.

## Acceptance Criteria

- Paid/eligible digital orders get codes assigned.
- Same code cannot be assigned twice.
- Re-running assignment is idempotent.
- Insufficient stock creates manual review/notification.
- Order details show digital assignment status.
- No full code is delivered to customer yet.

---

# Phase 18 — Automatic Digital Delivery ⏳ PENDING

## Goal

Deliver assigned codes to customers automatically after eligible WooCommerce order statuses.

Start with safe dashboard/woocommerce-note delivery and optional email placeholder. Real WhatsApp remains provider-dependent unless already configured.

## Scope

Build:

- `digital_deliveries`
- `delivery_attempts`
- Delivery service
- Delivery templates
- Delivery after assignment/order status
- Manual resend endpoint foundation
- WooCommerce order note integration through connector if safe
- Dashboard delivery status UI

Do not build:

- Full customer portal yet
- Advanced WhatsApp provider
- Full email SMTP settings unless already available

## Database

Add migration `0015_digital_deliveries`.

Create:

```txt
digital_deliveries
delivery_attempts
```

Use definitions in sections 4.8 and 4.9.

## Delivery Channels MVP

Implement channels in this order:

1. `dashboard` — codes available inside SaaS order details to staff.
2. `woocommerce_note` — add private or customer note to WooCommerce order if approved.
3. `email` — only if email infra exists; otherwise queue placeholder and mark skipped.
4. `whatsapp` — placeholder only unless provider exists.

Important:

- Do not expose full codes in WooCommerce admin notes unless explicitly required.
- Recommended: customer note says “Your digital codes are ready” and link/instructions, not raw codes, until customer portal exists.
- If business requires raw code in WooCommerce customer note, make it a setting and warn in docs.

## Backend Endpoints

```txt
POST /digital-delivery/orders/:orderId/deliver
POST /digital-delivery/orders/:orderId/resend
GET  /digital-delivery/orders/:orderId/deliveries
GET  /digital-delivery/deliveries/:id
```

## Delivery Service

Function:

```ts
deliverCodesForOrder(storeId, orderId, options)
```

Steps:

1. Load order.
2. Confirm order has digital assignments.
3. Confirm order status is eligible according to product settings `deliver_on_statuses`.
4. Confirm all required codes are assigned.
5. Create digital_delivery row.
6. Generate message from template.
7. Create delivery_attempt.
8. Mark assignments as delivered.
9. Mark codes as delivered.
10. Mark order digital_delivery_status = completed.
11. Record audit log.
12. Create notification if failed.

## Template Variables

Support:

```txt
{{customer_name}}
{{order_number}}
{{product_name}}
{{code}}
{{codes}}
{{instructions}}
{{store_name}}
```

Rules:

- `{{code}}` only valid for one code.
- `{{codes}}` renders list.
- Template rendering must not log output.
- If template missing, use safe default Arabic template.

Default Arabic template:

```txt
مرحباً {{customer_name}},
تم تجهيز طلبك رقم {{order_number}}.
الأكواد:
{{codes}}

{{instructions}}
```

## WordPress Connector Changes

Add endpoint:

```txt
POST /wp-json/saas/v1/orders/:orderId/digital-note
```

or reuse existing signed API client pattern.

Responsibilities:

- Verify signature from SaaS.
- Find WooCommerce order.
- Add order note.
- Optionally mark meta:

```txt
_saas_digital_delivery_status
_saas_digital_delivery_completed_at
```

Do not store raw code meta unless explicitly required.

## Frontend

In `/digital-delivery/orders/:orderId` or order details section:

Show:

- Delivery status
- Delivery attempts
- Channel
- Last attempt date
- Failure reason
- Actions:
  - إرسال الأكواد
  - إعادة الإرسال

Arabic statuses:

```txt
pending = قيد الانتظار
processing = جاري المعالجة
completed = مكتمل
failed = فشل
manual_review = مراجعة يدوية
```

## Audit Logs

Actions:

```txt
digital_delivery_started
digital_delivery_completed
digital_delivery_failed
digital_delivery_resent
```

No raw codes in audit metadata.

## Notifications

Create notifications:

- Delivery failed.
- Partial delivery/manual review.
- Low stock after delivery.

## Tests

Add tests for:

- Delivery requires assignments.
- Delivery is idempotent.
- Delivery updates codes to delivered.
- Delivery respects eligible statuses.
- Delivery failure creates attempt + notification.
- Template rendering does not expose raw code in logs.
- Connector route verifies signature.

## Acceptance Criteria

- Assigned codes can be delivered from dashboard.
- Eligible orders can auto-deliver after assignment.
- Delivery attempts are stored.
- Failed delivery is visible and actionable.
- Delivered codes are marked delivered.
- Full codes are never logged.

---

# Phase 19 — Manual Fulfillment, Resend & Replacement ⏳ PENDING

## Goal

Give staff practical tools to handle real customer support cases:

- Assign codes manually
- Reveal code securely
- Resend delivery
- Replace invalid code
- Mark code invalid
- Handle refund/cancel cases safely

## Scope

Build:

- Manual assign UI
- Resend flow
- Replacement flow
- Invalid/refund status transitions
- Support notes
- Strong audit logs

Do not build:

- Supplier advanced reconciliation
- Customer portal

## Backend Endpoints

```txt
POST /digital-delivery/orders/:orderId/manual-assign
POST /digital-delivery/assignments/:assignmentId/resend
POST /digital-delivery/assignments/:assignmentId/replace
PATCH /digital-delivery/assignments/:assignmentId/status
POST /digital-inventory/codes/:id/mark-invalid
```

## Manual Assign

Input:

```json
{
  "orderItemId": "...",
  "codeId": "...",
  "reason": "Manual selection"
}
```

Rules:

- Requires `digital_delivery.assign`.
- Code must be available.
- Product must match order item product.
- Use transaction.
- Mark code sold/assigned.
- Record audit.

## Replacement

Input:

```json
{
  "reason": "Customer reported code already used",
  "replacementCodeId": null
}
```

Behavior:

- If `replacementCodeId` provided, use it after validation.
- Otherwise auto-pick next available code.
- Old assignment status = replaced.
- Old code status = invalid or replacement depending selected reason.
- New assignment type = replacement.
- New code status = delivered if immediately delivered, otherwise sold.
- Record link `replaced_by_assignment_id`.
- Create delivery attempt if resend immediate.

## Resend

Rules:

- Resend same assigned code.
- Does not create new assignment.
- Creates new delivery_attempt.
- Audit-log resend.
- Rate limit if exposed to customer later.

## Refund/Cancellation Handling

When WooCommerce order becomes cancelled/refunded:

- Do not put delivered code back to available.
- Mark assignment refunded/cancelled.
- Mark code refunded if delivered or sold.
- For reserved-but-not-delivered codes, optional release back to available only if never revealed/delivered.

Rules:

```txt
If code delivered/revealed: never return to available automatically.
If code reserved and not revealed: can release to available.
```

## Frontend

Add support actions inside order digital section:

- كشف الكود
- إعادة الإرسال
- استبدال الكود
- تعيين كود يدوي
- تعليم الكود كغير صالح

Replacement dialog fields:

- سبب الاستبدال
- اختيار كود بديل، optional
- إرسال البديل للعميل الآن، checkbox

## Audit Logs

Actions:

```txt
digital_code_manually_assigned
digital_code_replaced
digital_code_resent
digital_code_marked_invalid
digital_assignment_refunded
digital_assignment_cancelled
```

Always require reason for destructive/support actions.

## Tests

Add tests for:

- Manual assign product mismatch rejected.
- Replacement does not reuse unavailable code.
- Replaced assignment linked to new assignment.
- Resend does not duplicate assignment.
- Delivered code is not returned to stock on refund.
- Reserved unrevealed code can be released if policy allows.

## Acceptance Criteria

- Staff can resolve failed/invalid code cases.
- Replacement flow is auditable.
- Resend works without duplicating assignment.
- Refund/cancel does not incorrectly resell used codes.
- Every sensitive action requires permission and audit log.

---

# Phase 20 — Suppliers & Batch Cost Tracking ⏳ PENDING

## Goal

Track where codes came from, supplier performance, and cost/profit basis.

## Scope

Build:

- Suppliers CRUD
- Supplier-product mapping
- Batch supplier assignment
- Cost fields in import flow
- Supplier summary
- Supplier details

Do not build:

- Accounting system
- Purchase orders
- Supplier portal

## Database

Add migration `0016_suppliers`.

Create:

```txt
suppliers
supplier_products
```

If `supplier_id` already exists in batches/codes from Phase 16, add FK after table creation or create suppliers earlier. If migration ordering needs adjustment, it is acceptable to create suppliers in Phase 16 but hide UI until Phase 20.

## Permissions

Use:

```txt
digital_suppliers.view
digital_suppliers.create
digital_suppliers.edit
digital_suppliers.delete
```

## Backend Endpoints

```txt
GET    /suppliers
POST   /suppliers
GET    /suppliers/:id
PATCH  /suppliers/:id
DELETE /suppliers/:id
GET    /suppliers/:id/products
POST   /suppliers/:id/products
PATCH  /suppliers/:id/products/:mappingId
DELETE /suppliers/:id/products/:mappingId
GET    /suppliers/:id/batches
```

Delete behavior:

- Prefer archive supplier, not hard delete.
- If hard delete implemented, use status archived.

## Frontend Pages

### /suppliers

Arabic title:

```txt
الموردين
```

Table:

- اسم المورد
- جهة التواصل
- البريد
- الهاتف
- الحالة
- عدد المنتجات
- آخر دفعة
- إجراءات

### /suppliers/:id

Sections:

- بيانات المورد
- المنتجات المرتبطة
- دفعات الأكواد
- ملخص الأداء

## Supplier Metrics

Show:

- Total codes imported
- Invalid codes count
- Sold codes count
- Estimated revenue if available
- Estimated cost
- Failure/replacement rate

## Import Flow Update

Add supplier dropdown in code import.

Fields:

- المورد
- تكلفة الكود
- العملة

## Audit Logs

Actions:

```txt
supplier_created
supplier_updated
supplier_archived
supplier_product_linked
supplier_product_updated
supplier_product_unlinked
```

## Tests

Add tests for:

- Supplier CRUD validation.
- Archive instead of hard delete.
- Supplier tenant isolation.
- Supplier metrics scoped by store.
- Batch supplier assignment.

## Acceptance Criteria

- Staff can manage suppliers.
- Code batches can be linked to suppliers.
- Cost per code is tracked.
- Supplier performance is visible.
- No accounting complexity is added.

---

# Phase 21 — Digital Reports & Profit Analytics ⏳ PENDING

## Goal

Add analytics specific to digital product operations.

## Scope

Build:

- Digital inventory report
- Digital sales/profit report
- Low stock report
- Supplier performance report
- Delivery success/failure report
- Export safe summaries, not raw codes

Do not build:

- Full accounting
- Tax reports
- Raw code exports unless explicit permission and audit

## Permission

Use:

```txt
digital_reports.view
```

## Backend Endpoints

```txt
GET /digital-reports/summary
GET /digital-reports/inventory
GET /digital-reports/sales
GET /digital-reports/profit
GET /digital-reports/suppliers
GET /digital-reports/delivery
GET /digital-reports/low-stock
```

## Metrics

### Summary

```txt
totalDigitalProducts
availableCodes
soldCodes
deliveredCodes
lowStockProducts
failedDeliveries
replacementRate
estimatedGrossProfit
```

### Inventory

Per product:

```txt
productName
available
reserved
sold
delivered
invalid
voided
lowStockThreshold
stockStatus
```

### Sales/Profit

Per product/date:

```txt
unitsSold
revenue
codeCost
grossProfit
grossMargin
refundCount
replacementCount
```

Revenue source:

- Use existing orders/order_items totals where possible.
- Paid statuses should follow dashboard revenue rules unless documented otherwise:

```txt
completed
processing
on-hold
```

Cost source:

- Prefer `digital_codes.cost_price`.
- Fall back to `code_batches.cost_per_code`.
- If no cost, treat as unknown, not zero.

### Supplier Performance

```txt
supplierName
codesImported
codesSold
codesInvalid
replacementCount
estimatedCost
estimatedProfit
invalidRate
```

### Delivery

```txt
totalDeliveries
completed
failed
manualReview
averageAttempts
failedByChannel
```

## Frontend Page

### /digital-reports

Arabic title:

```txt
تقارير الأكواد
```

Tabs:

- ملخص
- المخزون
- المبيعات والربح
- الموردين
- التسليم
- منخفض المخزون

Use existing chart style. Avoid adding heavy chart dependencies unless already used.

## Export

Optional endpoint:

```txt
GET /digital-reports/export
```

Rules:

- Summary export only.
- No raw codes.
- Requires `digital_reports.view`.
- If exporting raw code inventory, require `digital_inventory.export` and separate Phase/approval.

## Audit Logs

Actions:

```txt
digital_report_viewed
 डिजिटल_report_exported
```

Avoid logging too noisy read events unless existing audit policy allows. If current audit excludes reads, only audit exports.

## Tests

Add tests for:

- Revenue/cost calculations.
- Unknown cost handling.
- Supplier metrics.
- Low stock threshold.
- No raw code in report response.
- Tenant isolation.

## Acceptance Criteria

- Store owner can see digital inventory health.
- Store owner can see estimated profit.
- Low stock products are obvious.
- Supplier quality is visible.
- Reports never expose raw codes.

---

# Phase 22 — Customer Self-Service Code Access ⏳ PENDING

## Goal

Allow customers to securely access their delivered codes without staff intervention.

This is sensitive. Build only after delivery engine is stable.

## Scope

Build one of two approaches:

### Preferred MVP Approach

A secure signed access link generated by SaaS and sent to customer.

### Alternative

WooCommerce My Account endpoint through the connector plugin.

Preferred: SaaS signed link because codes stay in SaaS, not WordPress.

## Requirements

- Customer can access only their own order codes.
- Link must expire.
- Link must be signed.
- Access must be rate-limited.
- Access must be logged in `customer_code_views`.
- Codes shown only after order eligibility is verified.
- Never expose another store/order codes.

## Database

Add migration `0017_customer_code_views`.

Create:

```txt
customer_code_views
```

Optionally create:

```txt
customer_access_tokens
```

If not storing tokens, use signed JWT-like tokens with expiry. Storing token hashes gives revocation ability.

Recommended token table:

```txt
id uuid primary key
store_id uuid not null
order_id uuid not null
customer_id uuid null
token_hash text not null
expires_at timestamp not null
used_count integer not null default 0
max_uses integer null
revoked_at timestamp null
created_at timestamp not null default now()
```

## Backend Endpoints

Authenticated staff:

```txt
POST /digital-delivery/orders/:orderId/customer-link
```

Public/customer endpoint:

```txt
GET /public/digital-orders/:token
```

Optional reveal endpoint:

```txt
POST /public/digital-orders/:token/reveal
```

## Public Response

Return:

```json
{
  "orderNumber": "10025",
  "storeName": "Sho9",
  "items": [
    {
      "productName": "Netflix 1 Month",
      "codes": [
        {
          "code": "FULL-CODE",
          "instructions": "..."
        }
      ]
    }
  ]
}
```

This is one of the few endpoints allowed to return full codes, but only with valid token.

## Security

- Token must include/store order scope.
- Token expires, default 7 days or configurable.
- Rate limit public endpoint by IP/token.
- Record customer view every time full codes are shown.
- Do not expose internal IDs unnecessarily.
- Do not include raw codes in frontend logs/errors.

## Frontend Public Page

Route:

```txt
/digital-order/:token
```

Arabic UI:

- عنوان: أكواد طلبك
- رقم الطلب
- المنتجات
- الكود
- زر نسخ الكود
- تعليمات الاستخدام
- رسالة انتهاء الرابط
- رسالة غير مصرح

No dashboard sidebar.

## WooCommerce Integration

Optional connector addition:

- Add customer order note with secure link.
- Add order meta with delivery status.

Do not store raw codes in WooCommerce.

## Audit / View Logs

- Staff creates link: audit log.
- Customer views code: `customer_code_views` row.
- Public token invalid/expired: do not audit too noisily, but can log security event if abuse detected.

## Tests

Add tests for:

- Token expiry.
- Token only accesses one order.
- Customer view logs are written.
- Revoked token rejected.
- Cross-store impossible.
- Public endpoint does not require JWT but requires valid token.

## Acceptance Criteria

- Customer can securely view delivered codes.
- Staff no longer needs to manually send every code.
- Expired/invalid links fail safely.
- Code views are tracked.
- Raw codes remain outside WordPress database.

---

# Phase 23 — Digital Automations Expansion ⏳ PENDING

## Goal

Add automations that are specific to digital product operations.

## Scope

Extend existing automations module with new automation types.

## New Automation Types

```txt
digital_low_stock_alert
digital_out_of_stock_alert
digital_failed_delivery_alert
digital_replacement_rate_alert
digital_supplier_quality_alert
auto_assign_codes_on_paid_order
auto_deliver_codes_on_paid_order
```

## Automation Configs

### digital_low_stock_alert

```json
{
  "enabled": true,
  "thresholdMode": "product_setting",
  "globalThreshold": 5
}
```

### digital_out_of_stock_alert

```json
{
  "enabled": true,
  "notifyRoles": ["Owner", "Manager"]
}
```

### digital_failed_delivery_alert

```json
{
  "enabled": true,
  "maxAttempts": 1
}
```

### digital_replacement_rate_alert

```json
{
  "enabled": true,
  "windowDays": 7,
  "maxReplacementRate": 0.05
}
```

### auto_assign_codes_on_paid_order

```json
{
  "enabled": true,
  "statuses": ["processing", "completed"],
  "allowPartial": false
}
```

### auto_deliver_codes_on_paid_order

```json
{
  "enabled": true,
  "statuses": ["processing", "completed"],
  "channel": "customer_link"
}
```

## Backend Changes

Extend automations config validation with new types.

Add run helpers:

```ts
runDigitalLowStockAlert
runDigitalOutOfStockAlert
runDigitalFailedDeliveryAlert
runDigitalReplacementRateAlert
runAutoAssignCodesOnPaidOrder
runAutoDeliverCodesOnPaidOrder
```

Queue names:

```txt
digital_inventory
digital_delivery
```

Job names:

```txt
digital_low_stock_check
digital_out_of_stock_check
digital_failed_delivery_check
digital_replacement_rate_check
auto_assign_codes
auto_deliver_codes
```

## Frontend

Update `/automations` page with a new section:

```txt
أتمتة المنتجات الرقمية
```

Cards:

- تنبيه انخفاض الأكواد
- تنبيه نفاد الأكواد
- تنبيه فشل التسليم
- تنبيه ارتفاع الاستبدالات
- تعيين الأكواد تلقائياً
- تسليم الأكواد تلقائياً

## Notifications

Add notification types if needed:

```txt
digital_low_stock
digital_out_of_stock
digital_delivery_failed
digital_quality_warning
```

## Audit Logs

Existing automation audit should capture enabled/disabled/config-updated.

## Tests

Add tests for:

- Config schemas.
- Disabled automation skipped.
- Low stock alert notification.
- Out of stock notification.
- Failed delivery notification.
- Auto assignment calls assignment service idempotently.
- Auto delivery calls delivery service idempotently.

## Acceptance Criteria

- Digital automations can be enabled/disabled.
- Low/out-of-stock alerts work.
- Failed delivery alerts work.
- Auto assignment and delivery use existing engines safely.
- Automation logs are stored.

---

# Phase 24 — Digital QA, Security Audit & Pilot Readiness ✅ COMPLETED

## Goal

Make the digital-products expansion safe enough for a controlled pilot on sho9.com or one real WooCommerce store.

## Scope

Full audit of:

- Security
- Encryption
- Code reveal rules
- Tenant isolation
- Assignment concurrency
- Delivery reliability
- Refund/replacement correctness
- Permissions
- UI states
- Production env
- WordPress connector changes

Do not build new features.

## Required Audit Areas

### 1. Security

Check:

- Codes encrypted at rest.
- Hash secret separate from encryption secret.
- Full codes never in logs.
- Full codes never in list responses.
- Reveal endpoint requires strict permission.
- Reveal endpoint is rate-limited.
- Public customer links expire.
- Public customer links are scoped to one order.
- Audit logs contain no raw code.
- Error handler does not leak code values.

### 2. Tenant Isolation

Check every digital query includes:

```txt
store_id
```

Critical tables:

```txt
digital_product_settings
code_batches
digital_codes
code_assignments
digital_deliveries
delivery_attempts
suppliers
supplier_products
customer_code_views
```

### 3. Assignment Safety

Check:

- Assignment is transactional.
- Row locking prevents double assignment.
- Re-running assignment is idempotent.
- Partial assignment behavior is documented.
- Insufficient stock creates visible failure.
- Refunded/delivered codes are not returned to available.

### 4. Delivery Safety

Check:

- Delivery does not duplicate assignments.
- Resend does not create new code.
- Replacement creates linked new assignment.
- Delivery failures are logged.
- Delivery attempts are visible.

### 5. Permissions

Test roles:

- Owner
- Manager
- Product Manager
- Order Employee
- Customer Support
- Viewer

Expected:

- Only allowed roles can reveal full code.
- Only allowed roles can import codes.
- Only allowed roles can replace codes.
- Viewer cannot mutate anything.

### 6. Frontend

Check:

- RTL layout.
- Dark mode.
- Mobile sidebar.
- Empty states.
- Loading states.
- Error states.
- No full code appears unless user clicked reveal.
- Copy buttons do not expose code accidentally in wrong places.

### 7. WordPress Connector

Check:

- Plugin still installs.
- Existing sync still works.
- Existing webhooks still work.
- New order note/status endpoint verifies signature.
- No raw code stored in WP unless explicitly configured.

### 8. Performance

Check:

- Code list pagination.
- Import large batch performance.
- Assignment query index usage.
- Reports query performance.
- Dashboard bundle size.

## Required Manual Test Scenarios

### Scenario A — Basic Digital Sale

1. Enable digital fulfillment for product.
2. Import 5 codes.
3. Create WooCommerce order for quantity 1.
4. Webhook syncs order.
5. Code assigned.
6. Code delivered.
7. Inventory available decreases.
8. Audit logs created.

Expected:

```txt
available: 4
assigned/sold/delivered: 1
order digital status: completed
```

### Scenario B — Quantity > 1

1. Customer buys quantity 3.
2. System assigns 3 unique codes.

Expected:

```txt
No duplicate codes.
3 assignments.
3 delivered codes.
```

### Scenario C — Insufficient Codes

1. Product has 1 available code.
2. Customer buys quantity 3.

Expected:

```txt
Manual review or partial status.
Notification created.
No double-selling.
```

### Scenario D — Repeated Webhook

1. Send same order webhook twice.

Expected:

```txt
No duplicate assignments.
No duplicate delivery.
```

### Scenario E — Replacement

1. Delivered code reported invalid.
2. Staff replaces code.

Expected:

```txt
Old assignment replaced.
New assignment created.
New code delivered/resend available.
Audit logs created.
```

### Scenario F — Refund

1. Delivered order is refunded.

Expected:

```txt
Delivered code is not returned to available.
Assignment marked refunded.
```

### Scenario G — Reveal Security

1. Viewer tries to reveal code.
2. Owner reveals code.

Expected:

```txt
Viewer denied.
Owner allowed.
Audit log written.
```

## Deliverables

Create:

```txt
digital-production-readiness-report.md
digital-security-checklist.md
digital-pilot-test-script.md
```

## Acceptance Criteria

- 0 critical security issues.
- No known double-selling path.
- No raw code leakage in logs/list APIs.
- One real pilot store can run controlled digital fulfillment.
- All tests/builds/lints pass.

---

# 9. Parallel Execution Model — Multi Claude Code Sessions

This section exists so the user can run multiple Claude Code sessions at the same time without creating destructive conflicts.

The project must **not** be parallelized by giving each session a different future phase.

Wrong:

```txt
Session 1 → Phase 15
Session 2 → Phase 16
Session 3 → Phase 17
```

This is dangerous because Phase 16 depends on Phase 15, Phase 17 depends on Phase 16, and later agents will guess contracts that do not exist yet.

Correct:

```txt
Session A → Phase 15 / Database only
Session B → Phase 15 / Backend API only
Session C → Phase 15 / Frontend only
Session D → Phase 15 / QA only
```

The correct method is to split **one phase** into isolated workstreams.

---

## 9.1 Parallel Workstream Rules

Every Claude session must be given:

1. The phase number.
2. The agent role.
3. The allowed folders.
4. The forbidden folders.
5. The expected output.
6. The stop condition.

Claude must stop and ask/report instead of editing if the requested task requires touching forbidden files.

---

## 9.2 Mandatory Branch Strategy

When running multiple sessions, never let all agents commit directly to the same branch.

Recommended branch format:

```txt
main
  └── feature/phase-15-digital-foundation
        ├── agent-a-db-phase-15
        ├── agent-b-api-phase-15
        ├── agent-c-ui-phase-15
        ├── agent-d-connector-phase-15
        └── agent-e-qa-phase-15
```

Recommended order:

```txt
1. Create phase branch from main:
   feature/phase-15-digital-foundation

2. Create agent branches from the phase branch.

3. Merge Agent A first if it includes migrations/schema.

4. Merge Agent B after Agent A.

5. Merge Agent C after API contract is stable.

6. Merge Agent D only if the phase touches WordPress connector.

7. Run Agent E QA after all implementation agents merge.
```

If time is very tight, Agent C can start while Agent B is working, but only if Agent B writes a stable temporary API contract first.

---

## 9.3 File Ownership Map

### Agent A — Database & Domain Foundation

Allowed:

```txt
apps/api/src/db/**
apps/api/src/schema/**
apps/api/src/lib/**
apps/api/src/modules/digital-*/**/*.service.ts
apps/api/src/modules/digital-*/**/*.repository.ts
apps/api/src/modules/digital-*/**/*.types.ts
apps/api/src/modules/digital-*/**/*.test.ts
apps/api/drizzle/**
apps/api/migrations/**
```

Forbidden:

```txt
apps/dashboard/**
plugins/wordpress-connector/**
apps/api/src/modules/**/controller.ts
apps/api/src/modules/**/routes.ts
```

Purpose:

- Tables
- Migrations
- Indexes
- Relations
- Crypto helpers
- Transaction-safe services
- Domain rules
- Unit tests for pure logic

---

### Agent B — Backend API, RBAC, Audit, Notifications

Allowed:

```txt
apps/api/src/modules/**/controller.ts
apps/api/src/modules/**/routes.ts
apps/api/src/modules/**/schemas.ts
apps/api/src/modules/**/serializer.ts
apps/api/src/modules/**/service.ts
apps/api/src/middleware/**
apps/api/src/permissions/**
apps/api/src/seeds/**
apps/api/src/routes/**
apps/api/src/app.ts
```

Forbidden unless explicitly coordinated:

```txt
apps/api/migrations/**
apps/api/src/db/**
apps/dashboard/**
plugins/wordpress-connector/**
```

Purpose:

- REST endpoints
- Zod schemas
- Permission checks
- Audit log calls
- Notification calls
- API response envelope
- API unit tests

---

### Agent C — Dashboard Frontend

Allowed:

```txt
apps/dashboard/src/**
apps/dashboard/index.html
apps/dashboard/package.json
```

Forbidden:

```txt
apps/api/**
plugins/wordpress-connector/**
```

Purpose:

- Arabic RTL pages
- Forms
- Tables
- API clients
- Sidebar navigation
- Permission-gated UI
- Loading / empty / error states
- Light and dark compatibility

---

### Agent D — WordPress Connector

Allowed:

```txt
plugins/wordpress-connector/**
```

Forbidden:

```txt
apps/api/**
apps/dashboard/**
```

Purpose:

- Thin connector endpoints
- WooCommerce hooks
- Signed SaaS communication
- No business logic
- No digital code storage inside WordPress
- PHP lint

---

### Agent E — QA / Security / Integration Review

Allowed:

```txt
docs/**
*.md
```

Read-only across source code unless explicitly asked to fix verified issues.

Purpose:

- Audit implementation
- Check tenant isolation
- Check RBAC
- Check raw-code leakage
- Check transactions
- Check tests/build/lint
- Write report

---

## 9.4 Contract-First Rule

If Agent C starts before Agent B finishes, Agent B must first create or report an API contract.

Contract format:

```txt
Endpoint:
Method:
Permission:
Request query/body:
Success response data:
Error codes:
Notes:
```

Frontend Agent must not invent endpoints.

If the backend endpoint does not exist yet, frontend can create the UI and API client using the agreed contract, but must clearly mark any unverified integration in the final report.

---

## 9.5 Merge Order Per Phase

Default merge order:

```txt
1. Agent A — Database/domain
2. Agent B — Backend API/RBAC/audit
3. Agent C — Dashboard UI
4. Agent D — WordPress connector, if needed
5. Agent E — QA
```

Exception:

- Agent C can work in parallel after receiving stable contracts.
- Agent D can work in parallel if it only touches plugin files.
- Agent E can run at any time as read-only review.

---

## 9.6 Conflict Rules

If two agents need the same file, only one agent owns it.

Common conflict files:

```txt
apps/api/src/app.ts
apps/api/src/routes/index.ts
apps/api/src/db/schema.ts
apps/api/src/permissions/*
apps/api/src/seeds/*
apps/dashboard/src/App.tsx
apps/dashboard/src/layout/sidebar*
apps/dashboard/src/lib/*api*.ts
```

Ownership:

```txt
schema/migrations        → Agent A
routes/controllers       → Agent B
permissions/seeds        → Agent B
frontend routes/nav      → Agent C
plugin files             → Agent D
QA reports               → Agent E
```

---

# 10. Phase-by-Phase Parallel Agent Recommendations

## Phase 15 — Digital Product Foundation

Goal:

Add product-level digital fulfillment settings. No real codes yet.

Recommended parallel sessions:

```txt
Agent A: DB/schema fields for digital settings if needed.
Agent B: product API validation/serializer/RBAC/audit.
Agent C: product form/details UI.
Agent E: review only.
```

Do not use Agent D unless WordPress connector needs product meta sync.

Conflict risk:

- Product serializer/service.
- Product form.
- Permissions seed.

Safe order:

```txt
A → B → C → E
```

Fast parallel order:

```txt
A and C can start together only if C is UI-only with mocked/stubbed local fields.
B starts after A.
E reviews continuously.
```

---

## Phase 16 — Code Inventory & Secure Import

Goal:

Create encrypted digital code inventory and secure import.

Recommended parallel sessions:

```txt
Agent A: digital_codes, batches, encryption/hash/import transaction services.
Agent B: import/list/reveal API, RBAC, audit, notifications.
Agent C: inventory pages/import UI/reveal UI.
Agent E: security audit.
```

Do not run two backend agents on crypto/import services at the same time.

Raw code rules are extremely strict in this phase.

Safe order:

```txt
A → B → C → E
```

Fast parallel order:

```txt
A starts crypto/schema.
B drafts API contracts only, then waits for A.
C starts UI shell from agreed contract.
E reviews crypto/logging assumptions.
```

---

## Phase 17 — Code Assignment & Reservation Engine

Goal:

Reserve and assign available codes to paid order items safely.

Recommended parallel sessions:

```txt
Agent A: assignment engine, transactions, locking, idempotency.
Agent B: assignment status API and audit integration.
Agent C: order detail digital assignment UI.
Agent E: concurrency/idempotency review.
```

This is a critical phase. Agent A owns the engine alone.

Safe order:

```txt
A → B → C → E
```

Fast parallel order:

```txt
A builds engine.
C builds read-only placeholders from DTO contract.
E audits race conditions while A works.
```

---

## Phase 18 — Automatic Digital Delivery

Goal:

Deliver assigned codes to customers after payment through approved channels.

Recommended parallel sessions:

```txt
Agent A: delivery service, delivery logs, retry-safe jobs.
Agent B: delivery API, notifications, audit.
Agent C: delivery history/status UI.
Agent D: WordPress order note/customer email hook if required.
Agent E: delivery leakage/security review.
```

Fast parallel order:

```txt
A and D can work together because D only touches plugin.
C can work from API contract.
E reviews message templates and leakage risk.
```

---

## Phase 19 — Manual Fulfillment, Resend & Replacement

Goal:

Allow support staff to resend, replace, and manually resolve failed digital fulfillment.

Recommended parallel sessions:

```txt
Agent A: replacement/resend domain services.
Agent B: support action endpoints, RBAC, audit.
Agent C: support UI actions in order details.
Agent E: abuse/sensitive-data review.
```

Conflict risk:

- Order details UI.
- Delivery service from Phase 18.

---

## Phase 20 — Suppliers & Batch Cost Tracking

Goal:

Track suppliers, batches, cost, and margin.

Recommended parallel sessions:

```txt
Agent A: suppliers/batches schema and services.
Agent B: suppliers API and audit.
Agent C: suppliers and batches UI.
Agent E: financial calculation review.
```

This phase is relatively safe to parallelize because it is mostly isolated.

---

## Phase 21 — Digital Reports & Profit Analytics

Goal:

Add digital inventory, supplier, and margin analytics.

Recommended parallel sessions:

```txt
Agent A: report queries and metrics.
Agent C: reports dashboard UI.
Agent E: calculation correctness review.
```

Do not let frontend invent financial formulas.

Agent A must document formulas before Agent C builds labels.

---

## Phase 22 — Customer Self-Service Code Access

Goal:

Allow customer to securely view purchased digital codes.

Recommended parallel sessions:

```txt
Agent A: secure token/access backend.
Agent C: public/customer page UI.
Agent D: WooCommerce customer link/note if required.
Agent E: security audit.
```

This phase is security-sensitive.

No public endpoint may reveal codes without strict token validation and audit logging.

---

## Phase 23 — Digital Automations Expansion

Goal:

Add digital-specific automations such as low digital stock, failed delivery alerts, supplier reorder reminders.

Recommended parallel sessions:

```txt
Agent A/B: automation config/helpers/jobs.
Agent C: automation UI additions.
Agent E: review notification spam and permissions.
```

---

## Phase 24 — Digital QA, Security Audit & Pilot Readiness ✅ COMPLETED

Goal:

Make the digital expansion safe for a real Sho9-style pilot.

Recommended sessions:

```txt
Agent E first: full audit, no code.
Implementation agents only after verified findings.
```

Agent E checks:

- raw code leakage
- cross-store leakage
- transaction safety
- duplicate order/webhook safety
- failed delivery handling
- refund/replacement safety
- audit log safety
- frontend permission gates
- build/lint/test status

---

# 11. Claude Code Prompts for Parallel Sessions

Use these prompts directly.

---

## 11.1 Coordinator Prompt — Use Before Starting a Phase

```txt
Read plan.md and plan2.md carefully.

We are starting Phase [X] — [PHASE NAME] from plan2.md.

Do not write code yet.

Your job is to act as coordinator and produce a parallel execution map for this phase.

Output:
1. Phase goal in 3 lines.
2. Dependencies from previous phases.
3. Exact sub-agents needed.
4. For each sub-agent:
   - allowed folders
   - forbidden folders
   - expected files
   - expected output
   - conflict risks
5. Recommended branch names.
6. Recommended merge order.
7. API contract needed before frontend starts.
8. Red lines for this phase.

Do not implement anything.
```

---

## 11.2 Agent A Prompt — Database & Domain Foundation

```txt
Read plan.md and plan2.md carefully.

You are Agent A — Database & Domain Foundation.

Phase: [X] — [PHASE NAME]

Allowed folders/files:
- apps/api/src/db/**
- apps/api/src/schema/**
- apps/api/src/lib/**
- apps/api/src/modules/digital-*/**/*.service.ts
- apps/api/src/modules/digital-*/**/*.repository.ts
- apps/api/src/modules/digital-*/**/*.types.ts
- apps/api/src/modules/digital-*/**/*.test.ts
- apps/api/drizzle/**
- apps/api/migrations/**

Forbidden:
- apps/dashboard/**
- plugins/wordpress-connector/**
- frontend files
- WordPress plugin files
- controller/routes files unless absolutely necessary and reported first

Task:
Implement only the database/domain foundation required by this phase.

Rules:
- Do not implement future phases.
- Do not add UI.
- Do not add WordPress plugin logic.
- Every table/query must be tenant-scoped by store_id where applicable.
- Add proper indexes.
- Use transactions for multi-step writes.
- Never log raw digital codes.
- Never return raw digital codes unless this phase explicitly allows it.
- Add unit tests for domain logic.

Before editing:
1. Inspect existing schema/migration conventions.
2. List files you will create/modify.
3. List any needed API contract for other agents.

After editing:
1. Run API typecheck/tests related to your changes.
2. Final report with files changed, checks, risks.
```

---

## 11.3 Agent B Prompt — Backend API, RBAC, Audit

```txt
Read plan.md and plan2.md carefully.

You are Agent B — Backend API, RBAC, Audit, Notifications.

Phase: [X] — [PHASE NAME]

Allowed folders/files:
- apps/api/src/modules/**/controller.ts
- apps/api/src/modules/**/routes.ts
- apps/api/src/modules/**/schemas.ts
- apps/api/src/modules/**/serializer.ts
- apps/api/src/modules/**/service.ts
- apps/api/src/middleware/**
- apps/api/src/permissions/**
- apps/api/src/seeds/**
- apps/api/src/routes/**
- apps/api/src/app.ts

Forbidden unless explicitly coordinated:
- apps/api/migrations/**
- apps/api/src/db/**
- apps/dashboard/**
- plugins/wordpress-connector/**

Task:
Implement only the backend API/RBAC/audit layer required by this phase.

Rules:
- Do not implement future phases.
- Use existing API envelope.
- Use Zod validation.
- Use requirePermission.
- Every query must be store-scoped.
- Add/modify permissions only if needed for this phase.
- Audit logs must never contain raw codes, API keys, tokens, prompts, or customer-sensitive payloads.
- Add tests for schemas/serializers/controllers where existing project style supports it.

Before editing:
1. Inspect existing module patterns.
2. Confirm whether Agent A schema/service exists.
3. If Agent A is not done, output API contract only and stop before coding risky integrations.

After editing:
1. Run API typecheck/lint/tests.
2. Final report with endpoint list and permission list.
```

---

## 11.4 Agent C Prompt — Dashboard Frontend

```txt
Read plan.md and plan2.md carefully.

You are Agent C — Dashboard Frontend.

Phase: [X] — [PHASE NAME]

Allowed folders/files:
- apps/dashboard/src/**
- apps/dashboard/index.html
- apps/dashboard/package.json

Forbidden:
- apps/api/**
- plugins/wordpress-connector/**

Task:
Implement only the React dashboard UI required by this phase.

Rules:
- Arabic RTL first.
- Light/dark mode compatible.
- Use existing UI/page patterns.
- Respect permissions through existing AuthProvider/hasPermission pattern.
- Include loading, empty, error, and no-access states.
- Do not invent backend endpoints.
- Use only the API contract from Agent B or existing implemented endpoints.
- No raw digital code should be displayed unless this phase explicitly allows reveal and the UI requires an explicit reveal action.

Before editing:
1. Inspect existing routes/sidebar/page patterns.
2. List files you will create/modify.
3. Confirm API contract being used.

After editing:
1. Run dashboard typecheck/lint/build.
2. Final report with pages/components added.
```

---

## 11.5 Agent D Prompt — WordPress Connector

```txt
Read plan.md and plan2.md carefully.

You are Agent D — WordPress Connector.

Phase: [X] — [PHASE NAME]

Allowed:
- plugins/wordpress-connector/**

Forbidden:
- apps/api/**
- apps/dashboard/**

Task:
Implement only the WordPress connector tasks explicitly required by this phase.

Rules:
- Keep the connector thin.
- Do not store digital codes in WordPress.
- Do not implement SaaS business logic in WordPress.
- Do not expose raw codes in order meta unless the phase explicitly says so.
- Use existing signed request/API key pattern.
- Keep WooCommerce hooks minimal and idempotent.
- Run PHP lint on changed files.

Before editing:
1. Inspect current plugin structure.
2. List files you will modify.
3. Confirm inbound/outbound endpoint contract.

After editing:
1. Run PHP lint.
2. Final report.
```

---

## 11.6 Agent E Prompt — QA / Security Audit

```txt
Read plan.md and plan2.md carefully.

You are Agent E — QA / Security / Integration Review.

Phase: [X] — [PHASE NAME]

Default mode: read-only.

Do not add features.
Do not refactor unrelated code.

Audit:
- tenant isolation
- RBAC coverage
- raw digital code leakage
- audit log safety
- transaction safety
- duplicate webhook/order handling
- frontend permission gates
- API validation
- error handling
- tests/build/lint status
- dark mode and RTL regressions if frontend changed

Output:
1. Critical issues
2. High issues
3. Medium issues
4. Low issues
5. Files inspected
6. Tests/checks run
7. Exact fix prompts for implementation agents

Only fix issues if the user explicitly asks you to fix them.
```

---

## 11.7 Phase 15 Ready-to-Use Parallel Prompts

### Phase 15 — Agent A

```txt
Read plan.md and plan2.md.

You are Agent A — Database & Domain Foundation.

Implement Phase 15 only: Digital Product Foundation.

Allowed:
- apps/api/src/db/**
- apps/api/src/schema/**
- apps/api/src/lib/**
- apps/api/src/modules/products/**/*.service.ts
- apps/api/src/modules/products/**/*.types.ts
- apps/api/src/modules/products/**/*.test.ts
- apps/api/migrations/**

Forbidden:
- apps/dashboard/**
- plugins/wordpress-connector/**
- controllers/routes unless you report first

Goal:
Add only the domain/database foundation that lets a product be marked/configured as a digital-fulfillment product.

Do not create/import/manage actual codes.
Do not create assignment or delivery logic.
Do not touch WordPress connector.

Before editing, list expected files and conflict risks.
After editing, run relevant API checks and report.
```

### Phase 15 — Agent B

```txt
Read plan.md and plan2.md.

You are Agent B — Backend API, RBAC, Audit.

Implement Phase 15 only: Digital Product Foundation.

Allowed:
- apps/api/src/modules/products/**
- apps/api/src/permissions/**
- apps/api/src/seeds/**
- apps/api/src/modules/audit-logs/** if needed

Forbidden:
- apps/dashboard/**
- plugins/wordpress-connector/**
- migrations/schema unless Agent A has not done it and you report first

Goal:
Expose product digital settings through existing product create/update/details/list flow.

Requirements:
- Zod validation.
- Serializer updates.
- Permission checks.
- Audit log for digital settings changes, with no sensitive values.
- No actual code inventory.
- No assignment.
- No delivery.

Before coding, inspect whether Agent A changes exist. If not, produce API contract and stop.
```

### Phase 15 — Agent C

```txt
Read plan.md and plan2.md.

You are Agent C — Dashboard Frontend.

Implement Phase 15 only: Digital Product Foundation UI.

Allowed:
- apps/dashboard/src/**

Forbidden:
- apps/api/**
- plugins/wordpress-connector/**

Goal:
Add product form/details UI for digital fulfillment settings.

Requirements:
- Arabic RTL labels.
- Light/dark compatible.
- Permission-gated edit controls.
- Loading/empty/error states if new data surface is added.
- Use existing product API client patterns.
- Do not invent endpoints; use Agent B API contract.
- Do not show or manage actual codes.

Before coding, confirm the API contract you are using.
```

### Phase 15 — Agent E

```txt
Read plan.md and plan2.md.

You are Agent E — QA/Security for Phase 15.

Do read-only audit unless explicitly asked to fix.

Check:
- Product digital settings are tenant-safe.
- Permissions match backend and frontend.
- Audit logs contain no sensitive values.
- No actual code inventory was accidentally implemented.
- No delivery/assignment logic was added.
- API validation is strict.
- UI is RTL/dark-mode safe.
- Tests/checks were run.

Return a clear report with exact fix prompts if needed.
```

---

## 11.8 How To Run Multiple Sessions Practically

Recommended practical commands/workflow:

```txt
Terminal 1:
Claude Code on branch agent-a-db-phase-15
Paste Agent A prompt.

Terminal 2:
Claude Code on branch agent-b-api-phase-15
Paste Agent B prompt.
Tell it to stop after API contract if Agent A is not merged yet.

Terminal 3:
Claude Code on branch agent-c-ui-phase-15
Paste Agent C prompt.
Tell it to build UI shell only if API is not ready.

Terminal 4:
Claude Code on branch agent-e-qa-phase-15
Paste Agent E prompt.
Read-only review.
```

Recommended merge:

```txt
git checkout feature/phase-15-digital-foundation
git merge agent-a-db-phase-15
git merge agent-b-api-phase-15
git merge agent-c-ui-phase-15
git merge agent-e-qa-phase-15 only if it has docs/reports, otherwise no merge needed
```

After merge:

```txt
Run full checks:
- API typecheck
- API lint
- API tests
- Dashboard typecheck
- Dashboard lint
- Dashboard build
- PHP lint if plugin changed
```

---

# 12. Non-MVP / Explicitly Deferred Features

Do not implement these unless a new plan explicitly requests them:

```txt
Advanced CRM
Chatwoot inbox
Full WhatsApp CRM conversation center
Advanced marketing campaigns
Smart coupons
Fraud detection AI
AI health score
Shipping integrations
Accounting system
Workflow builder
Mobile app
Multi-language dashboard
Supplier portal
Purchase order system
Raw code marketplace
Multi-store shared inventory
Advanced fraud/risk scoring
Automatic dispute management
```

---

# 13. Digital Expansion Success Definition

The digital-products expansion is successful when a store owner can:

1. Mark a WooCommerce product as a digital-code product.
2. Import encrypted codes into that product.
3. See available/sold/delivered stock.
4. Receive warning before codes run out.
5. Have codes assigned automatically when an eligible paid order arrives.
6. Deliver codes automatically or manually.
7. Resend or replace a code when customer support needs it.
8. Track supplier/batch cost.
9. See digital profit and stock reports.
10. Let customers securely access their delivered codes.
11. Prove every sensitive action through audit logs.
12. Avoid double-selling codes under repeated webhooks or concurrent orders.

---

# 14. Absolute Red Lines

Claude must never violate these:

- Never store raw code values in plaintext DB columns.
- Never log raw code values.
- Never show full codes in list endpoints.
- Never assign the same code to two active assignments.
- Never return delivered/refunded codes to available automatically if they were revealed or delivered.
- Never let a user access another store's inventory.
- Never let low-permission roles reveal/export codes.
- Never put code inventory logic inside the WordPress plugin.
- Never skip audit logs for reveal/import/assignment/replacement/export.
- Never continue silently after delivery/assignment failure; create visible status/notification/log.

---

# 15. Recommended Build Order

```txt
Phase 15 — Digital Product Foundation
Phase 16 — Code Inventory & Secure Import
Phase 17 — Code Assignment & Reservation Engine
Phase 18 — Automatic Digital Delivery
Phase 19 — Manual Fulfillment, Resend & Replacement
Phase 20 — Suppliers & Batch Cost Tracking
Phase 21 — Digital Reports & Profit Analytics
Phase 22 — Customer Self-Service Code Access
Phase 23 — Digital Automations Expansion
Phase 24 — Digital QA, Security Audit & Pilot Readiness
```

Do not start Phase 17 until Phase 16 is completed and verified.
Do not start Phase 18 until Phase 17 assignment is safe and idempotent.
Do not start Phase 22 until Phase 18 delivery is stable.
Do not start Phase 24 until all digital phases intended for pilot are complete.
