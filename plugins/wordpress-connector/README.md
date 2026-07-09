# SaaS Connector (WordPress Plugin) — v1.0.0

A thin WordPress/WooCommerce plugin that connects a store to the SaaS Operations
Dashboard. It detects WooCommerce events, normalizes payloads, sends signed
webhooks, and executes **named, idempotent commands** the SaaS issues. It holds
**no business logic** — all decisions live in the SaaS (plan3 §1.3).

## What it does

- **Connection & health**: `SaaS Connector` admin page, connect/verify/disconnect,
  public `GET /wp-json/saas/v1/health`.
- **Capability handshake** (`GET /capabilities`): reports the connector version and
  the operations this build supports so the dashboard gates features gracefully.
- **Write-back suite** (all HMAC-signed, idempotent, echo-marked, compare-and-set
  where the entity supports it):
  - Products: create/update, **delete** (trash/force), **variations**, **bulk**
    price/stock/status, **media** sideload, **taxonomies** (categories/tags/attributes).
  - Orders: **status** transitions, **notes** (private/customer), **refunds**
    (with optional gateway money movement, own domain idempotency).
  - **Coupons**: full CRUD.
  - **Customers**: field-allowlisted name/phone/billing/shipping edits (never
    login/password/role).
  - **Reviews**: list, moderate (approve/hold/spam/trash), reply.
  - **Store config**: settings groups (general/products/tax), shipping zones &
    methods, tax rates, payment-gateway enable/disable.
- **Real-time webhooks**: product/order/customer/coupon/review create·update·delete,
  plus `order.refunded`. Each webhook carries `entityVersion` (compare-and-set token)
  and `originCommandId` (echo marker).
- **Reconciliation counts** (`GET /counts/{domain}`): per-domain counts the SaaS
  compares to its mirror to detect and self-heal drift.
- **Sync reads**: `GET /sync/{products,orders,customers,coupons,reviews}`.

## Security model

- **HMAC-SHA256** over `"{timestamp}.{body}"` on every inbound and outbound request,
  with a 300s timestamp window (replay defense). See `class-saas-connector-signature.php`.
- **Idempotency**: mutating requests carry `X-Saas-Idempotency-Key`; a replay returns
  the stored result without re-applying (`class-saas-connector-idempotency.php`, durable
  table). Refunds additionally key their WooCommerce refund on the SaaS key **before**
  any gateway call, so a retry can never double-refund.
- **Echo suppression**: mutating requests carry `X-Saas-Command-Id`; the connector
  stamps it onto every webhook the change fires (`originCommandId`) so the SaaS confirms
  its own command instead of re-processing the echo.
- **Compare-and-set**: `X-Saas-Expected-Version` is checked against the entity's
  `date_modified`; a mismatch returns **409** so the SaaS never overwrites a wp-admin edit.
- **Gateway secrets NEVER leave WordPress**: gateway responses expose only
  id/title/description/enabled; secret-typed fields are stripped at the connector, and
  the SaaS applies a second defensive strip. Gateway writes accept only
  `enabled`/`title`/`description`.
- **Base-currency gotcha**: writing `woocommerce_currency` neutralizes the
  `pre_option_woocommerce_currency` filter for the duration of the write so it is not a
  no-op (fares-store multi-currency compatibility).

## Installation

1. Copy `wordpress-connector` into `wp-content/plugins/` and activate **SaaS Connector**.
2. In the SaaS dashboard, generate a connector API key for the store (shown once).
3. In WordPress admin → **SaaS Connector**, enter the SaaS API URL (e.g.
   `https://app.example.com/api/v1`) and the key, then **Connect**.

Activation creates the idempotency table; upgrades that skip the activation hook
create it lazily on `plugins_loaded`.

## Capability list

The dashboard reads `capabilities` from `/capabilities` (and the connect payload) and
hides any write-back feature the installed connector does not advertise. See
`class-saas-connector-capabilities.php` for the authoritative list. An out-of-date
connector degrades to an "update the connector" notice rather than erroring.

## What still needs wp-admin

The connector deliberately does **not** cover (plan3 §12): WordPress core
administration (plugin/theme install, WP users, menus, page/post content), payment
**gateway credentials**, WooCommerce Subscriptions/Bookings/Memberships, storefront
theme controls, and the fares-store multi-currency FX admin.
