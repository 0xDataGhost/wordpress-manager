<?php
/**
 * Plugin Name:       SaaS Connector
 * Plugin URI:        https://example.com/saas-connector
 * Description:        Connects this WooCommerce store to the SaaS Operations Dashboard: connection/health, product publish, manual + webhook sync, digital delivery notes, and the full write-back suite (idempotent commands, echo suppression, capability handshake, compare-and-set) covering orders (status/notes/refunds), catalog (variations/taxonomies/media/bulk/delete), coupons, customers, review moderation, store configuration (settings/shipping/taxes/gateway toggles), and parity reconciliation.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            SaaS Dashboard
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       saas-connector
 *
 * @package SaasConnector
 */

// Block direct access.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SAAS_CONNECTOR_VERSION', '1.0.0' );
define( 'SAAS_CONNECTOR_PLUGIN_FILE', __FILE__ );
define( 'SAAS_CONNECTOR_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'SAAS_CONNECTOR_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-settings.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-echo.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-idempotency.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-versioning.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-capabilities.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-signature.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-api-client.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-normalize.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-products.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-orders.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-catalog.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-coupons.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-people.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-config.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-counts.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-sync.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-delivery.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-webhooks.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-rest.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-admin.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector.php';

/**
 * Activation: register the settings option with autoload disabled so the API
 * key is never loaded into memory on every request.
 */
function saas_connector_activate() {
	Saas_Connector_Settings::install();
	Saas_Connector_Idempotency::install();
}
register_activation_hook( __FILE__, 'saas_connector_activate' );

/**
 * Boot the plugin once WordPress (and optionally WooCommerce) is loaded.
 */
function saas_connector_boot() {
	// Upgrades that skip the activation hook still get schema changes — the
	// installer is a no-op when the stored schema version already matches.
	Saas_Connector_Idempotency::install();
	Saas_Connector::instance()->init();
}
add_action( 'plugins_loaded', 'saas_connector_boot' );
