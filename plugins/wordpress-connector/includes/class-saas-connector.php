<?php
/**
 * Core plugin bootstrap.
 *
 * Wires up the admin UI and the REST surface. Intentionally thin: the connector
 * holds no business logic, only connection management and a health endpoint.
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector {

	/**
	 * Singleton instance.
	 *
	 * @var Saas_Connector|null
	 */
	private static $instance = null;

	/**
	 * @var Saas_Connector_Admin
	 */
	private $admin;

	/**
	 * @var Saas_Connector_Rest
	 */
	private $rest;

	/**
	 * @var Saas_Connector_Webhooks
	 */
	private $webhooks;

	/**
	 * Get the shared instance.
	 *
	 * @return Saas_Connector
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		$this->admin    = new Saas_Connector_Admin();
		$this->rest     = new Saas_Connector_Rest();
		$this->webhooks = new Saas_Connector_Webhooks();
	}

	/**
	 * Register hooks.
	 */
	public function init() {
		$this->rest->register();
		// Outbound webhooks must run on every surface (admin, REST, cron,
		// front-end checkout), not just wp-admin — register unconditionally.
		$this->webhooks->register();
		if ( is_admin() ) {
			$this->admin->register();
		}
	}
}
