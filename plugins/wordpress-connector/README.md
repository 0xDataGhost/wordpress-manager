# SaaS Connector (WordPress Plugin)

A lightweight WordPress/WooCommerce plugin that connects a store to the SaaS
Operations Dashboard. This is the **Phase 4 foundation**: connection management
and a health endpoint only. It is a **connector** — it contains no business
logic and does **not** sync products, orders, or customers yet (Phase 5).

## What it does

- Adds a **SaaS Connector** admin page (capability: `manage_options`).
- Stores the SaaS API URL and connector API key in `wp_options`.
- Connects/verifies/disconnects the store against the SaaS backend.
- Exposes a public, non-sensitive health endpoint:
  `GET /wp-json/saas/v1/health`.
- Provides an HMAC request-signing helper for future SaaS ↔ WordPress traffic.

## Installation

1. Copy the `wordpress-connector` folder into `wp-content/plugins/`.
2. Activate **SaaS Connector** from the WordPress Plugins screen.
3. In the SaaS dashboard, generate a connector API key for your store
   (`POST /stores/current/api-key`). The key is shown **once**.
4. Open **SaaS Connector** in WordPress admin, enter:
   - **SaaS API URL** — the API base, e.g. `https://app.example.com/api/v1`
   - **API Key** — the key you just generated
5. Click **Connect**. The status should change to **Connected**.

## Admin page

| Field / Button       | Purpose                                              |
| -------------------- | ---------------------------------------------------- |
| Connection Status    | Current state: Disconnected / Pending / Connected    |
| SaaS API URL         | Base URL of the SaaS API (with version prefix)       |
| API Key              | Connector API key (generated in the dashboard)       |
| Connect              | Save settings and link the store                     |
| Run Health Check     | Verify the stored credentials are still valid        |
| Disconnect           | Revoke on the SaaS and clear the local key           |

## REST endpoint

`GET /wp-json/saas/v1/health` → `200`

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "plugin": "saas-connector",
    "pluginVersion": "0.1.0",
    "connected": false,
    "storeConfigured": false,
    "woocommerceActive": true,
    "timestamp": "2026-06-21T12:00:00+00:00"
  },
  "message": ""
}
```

The endpoint is intentionally public (the SaaS calls it without a WordPress
login) and returns only non-sensitive status. It never exposes the API key.

## Real-time webhooks (Phase 13)

In addition to manual sync, the connector forwards real-time changes to the SaaS
so products, orders, and customers stay current without pressing **Manual Sync**.
It hooks a small, fixed set of WooCommerce/WordPress actions and POSTs a
normalized event envelope to the SaaS webhook endpoints (bearer + HMAC signed,
same auth as the other connector calls):

| WordPress/WooCommerce action    | Event topic        | SaaS endpoint              |
| ------------------------------- | ------------------ | -------------------------- |
| `woocommerce_update_product`    | `product.updated`  | `POST /wp/webhooks/products`  |
| `woocommerce_product_set_stock` | `product.updated`  | `POST /wp/webhooks/products`  |
| `woocommerce_new_order`         | `order.created`    | `POST /wp/webhooks/orders`    |
| `woocommerce_update_order`      | `order.updated`    | `POST /wp/webhooks/orders`    |
| `user_register`                 | `customer.created` | `POST /wp/webhooks/customers` |
| `profile_update`                | `customer.updated` | `POST /wp/webhooks/customers` |

Each envelope carries `event`, an `eventId` idempotency key, `externalId`, an
`occurredAt` timestamp, and a normalized `data` object identical to the
manual-sync shape. The connector stays thin: it only detects the change and
fires one HTTP POST — all upsert/dedup logic lives on the SaaS, which records
every event and ignores duplicate deliveries. Customer hooks fire only for users
with the WooCommerce `customer` role. Delivery is best-effort with no advanced
retry; failures are logged when `WP_DEBUG` is enabled.

## Security

- **Capability checks**: the admin page and every action require `manage_options`.
- **Nonces**: all state-changing actions use `check_admin_referer`.
- **Sanitization/escaping**: inputs are sanitized (`esc_url_raw`,
  `sanitize_text_field`); all output is escaped (`esc_html`, `esc_attr`,
  `esc_url`).
- **Autoload disabled**: settings are stored with `autoload = 'no'`, so the API
  key is not loaded on every request.
- **Outgoing auth**: requests to the SaaS send `Authorization: Bearer <key>`
  plus an HMAC signature (`X-Saas-Signature` / `X-Saas-Timestamp`).

### ⚠️ API key storage risk (documented)

WordPress has no application-level secret store, so the connector API key is
saved in the `wp_options` table (autoload disabled). Anyone with database access
or `manage_options` on this site can read it. Mitigations and guidance:

- The key is **store-scoped** and only authorizes the connector endpoints — it
  is **not** a dashboard login and grants no access to other tenants.
- Treat the WordPress admin/database as the trust boundary; restrict admin users.
- If the key is exposed, **regenerate** it in the SaaS dashboard
  (`POST /stores/current/api-key`), which immediately invalidates the old key,
  then re-enter it here.
- A future hardening step can encrypt the key at rest using a site-specific key
  (e.g. derived from `wp-config.php` salts).

## Files

```
wordpress-connector/
  saas-connector.php                         # Plugin header + bootstrap
  uninstall.php                              # Removes settings on delete
  includes/
    class-saas-connector.php                 # Core singleton, hook wiring
    class-saas-connector-settings.php        # wp_options storage (autoload off)
    class-saas-connector-admin.php           # Admin page, actions, security
    class-saas-connector-rest.php            # Health + product write + sync read routes
    class-saas-connector-products.php        # SaaS-driven product create/update
    class-saas-connector-sync.php            # Read endpoints the SaaS pulls during sync
    class-saas-connector-normalize.php       # Shared WooCommerce -> SaaS shaping
    class-saas-connector-webhooks.php        # Real-time event sender (Phase 13)
    class-saas-connector-api-client.php      # Calls SaaS connector endpoints
    class-saas-connector-signature.php       # HMAC signing/verification helper
```

## Not in scope

- Any business logic inside WordPress (the SaaS owns all sync/upsert logic)
- Advanced webhook retry / queueing (best-effort delivery only)
