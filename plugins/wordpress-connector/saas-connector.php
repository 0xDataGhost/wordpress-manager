<?php
/**
 * Plugin Name:       SaaS Connector
 * Plugin URI:        https://example.com/saas-connector
 * Description:        Connects this WooCommerce store to the SaaS Operations Dashboard. Phase 4 foundation: connection management and health check only (no data sync yet).
 * Version:           0.1.0
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

define( 'SAAS_CONNECTOR_VERSION', '0.1.0' );
define( 'SAAS_CONNECTOR_PLUGIN_FILE', __FILE__ );
define( 'SAAS_CONNECTOR_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'SAAS_CONNECTOR_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-settings.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-signature.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-api-client.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-products.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-rest.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector-admin.php';
require_once SAAS_CONNECTOR_PLUGIN_DIR . 'includes/class-saas-connector.php';

/**
 * Activation: register the settings option with autoload disabled so the API
 * key is never loaded into memory on every request.
 */
function saas_connector_activate() {
	Saas_Connector_Settings::install();
}
register_activation_hook( __FILE__, 'saas_connector_activate' );

/**
 * Boot the plugin once WordPress (and optionally WooCommerce) is loaded.
 */
function saas_connector_boot() {
	Saas_Connector::instance()->init();
}
add_action( 'plugins_loaded', 'saas_connector_boot' );
