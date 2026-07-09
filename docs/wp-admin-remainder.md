# Dashboard Coverage vs. wp-admin — What Moved, What Stayed

As of the v1.0.0 write-back release (plan3 Phases 25–32), the SaaS dashboard is the
primary operating surface for a connected WooCommerce store. This document is the
honest boundary: what a merchant can now do **entirely from the dashboard**, and what
still requires **wp-admin** by design.

## ✅ Now fully in the dashboard

| Area | Dashboard capability | Permission |
|---|---|---|
| **Products** | Create/update, publish, **delete** (trash/force), **variations** (create/update/delete), **bulk** price/stock/status (≤50), **media** sideload (featured/gallery) | `products.*`, `products.manage_media` |
| **Catalog** | Categories / tags / attributes — full CRUD | `catalog.manage_taxonomies` |
| **Orders** | Status transitions (fires all Woo side effects: emails, stock, digital delivery), private/customer **notes**, **refunds** — record-only and **real gateway money** refunds | `orders.manage_status`, `orders.add_notes`, `orders.refund`, `orders.refund_payment` |
| **Coupons** | Full CRUD (type, amount, expiry, usage limits, restrictions, free shipping) | `coupons.view`, `coupons.manage` |
| **Customers** | Edit name / phone / billing / shipping in WooCommerce | `customers.manage` |
| **Reviews** | Moderate (approve/hold/spam/trash), reply as the store | `reviews.moderate` |
| **Store config** | General/products/tax settings (allowlisted), shipping zones & methods, tax rates, **enable/disable payment gateways** | `store_settings.view/manage`, `shipping.manage`, `taxes.manage`, `gateways.toggle` |
| **Operations** | Command Center (outbox status + retry), parity reconciliation (drift detection + notify), real-time mirror via webhooks | `wp_commands.*`, `settings.view` |

Every mutation above flows through the **command outbox**: recorded before it's
attempted, idempotent (a retry never double-applies), echo-suppressed (the change's
own webhook doesn't re-process), and compare-and-set where the entity supports it
(a stale dashboard edit gets a 409 instead of clobbering a wp-admin change).

## 🚫 Still requires wp-admin (by design — plan3 §12)

These are **deliberately** out of scope. They are not partially built; the dashboard
does not touch them:

- **WordPress core administration** — installing/updating plugins & themes, WP users
  (roles/passwords/logins), menus, and page/post **content** editing.
- **Payment-gateway credentials** — the dashboard can enable/disable a gateway and
  edit its title/description, but **API keys, secrets, merchant ids, and webhook
  secrets never leave WordPress** (the connector's gateway response is built from an
  explicit safe-field allowlist; the SaaS applies a second defensive strip).
- **WooCommerce Subscriptions / Bookings / Memberships** — extension-specific data
  models.
- **Storefront theme** — the fares-theme stays git/wp-admin managed.
- **fares-store multi-currency FX admin** — the manual FX-override UI (candidate for a
  later store-specific extension).

## Degradation & safety notes

- **Outdated connector** → the dashboard reads the connector's capability list and
  **hides** any write-back feature the installed plugin doesn't advertise, showing an
  "update the connector" notice instead of erroring.
- **Store not connected** → write-back endpoints return a clear 503 telling the
  operator to connect first.
- **Two admins at once** → compare-and-set (409) protects catalog/order/coupon/
  customer edits; scheduled/on-demand **reconciliation** catches anything a lost
  webhook missed and re-pulls the drifted domain.
