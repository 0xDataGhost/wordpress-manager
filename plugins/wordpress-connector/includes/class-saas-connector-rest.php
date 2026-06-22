<?php
/**
 * REST API surface exposed by the connector.
 *
 * Phase 4 shipped a public health endpoint so the SaaS can confirm the site is
 * reachable and the plugin is active. Phase 5 adds authenticated product
 * create/update endpoints (POST /products, PUT /products/{id}) that the SaaS
 * calls to push catalog data into WooCommerce. Those endpoints verify the
 * connector's HMAC signature via Saas_Connector_Products::authorize() and
 * return only non-sensitive product data — never the API key or settings.
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_Rest {

	const NAMESPACE = 'saas/v1';

	/**
	 * Product write endpoints handler.
	 *
	 * @var Saas_Connector_Products
	 */
	private $products;

	/**
	 * Sync read endpoints handler.
	 *
	 * @var Saas_Connector_Sync
	 */
	private $sync;

	public function __construct() {
		$this->products = new Saas_Connector_Products();
		$this->sync     = new Saas_Connector_Sync();
	}

	/**
	 * Hook route registration.
	 */
	public function register() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Register the connector's REST routes.
	 */
	public function register_routes() {
		register_rest_route(
			self::NAMESPACE,
			'/health',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'health' ),
				'permission_callback' => '__return_true',
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/products',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this->products, 'create_product' ),
				'permission_callback' => array( $this->products, 'authorize' ),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/products/(?P<id>\d+)',
			array(
				'methods'             => WP_REST_Server::EDITABLE,
				'callback'            => array( $this->products, 'update_product' ),
				'permission_callback' => array( $this->products, 'authorize' ),
				'args'                => array(
					'id' => array(
						'validate_callback' => static function ( $value ) {
							return is_numeric( $value );
						},
					),
				),
			)
		);

		// Read endpoints the SaaS pulls during a manual sync. Same signature auth
		// as the write endpoints; these only read WooCommerce and return
		// normalized, non-sensitive data.
		$sync_args = array(
			'page'     => array(
				'validate_callback' => static function ( $value ) {
					return is_numeric( $value );
				},
			),
			'per_page' => array(
				'validate_callback' => static function ( $value ) {
					return is_numeric( $value );
				},
			),
		);

		register_rest_route(
			self::NAMESPACE,
			'/sync/products',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this->sync, 'get_products' ),
				'permission_callback' => array( $this->sync, 'authorize' ),
				'args'                => $sync_args,
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/sync/orders',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this->sync, 'get_orders' ),
				'permission_callback' => array( $this->sync, 'authorize' ),
				'args'                => $sync_args,
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/sync/customers',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this->sync, 'get_customers' ),
				'permission_callback' => array( $this->sync, 'authorize' ),
				'args'                => $sync_args,
			)
		);
	}

	/**
	 * Return a non-sensitive health snapshot.
	 *
	 * @return WP_REST_Response
	 */
	public function health() {
		$data = array(
			'status'             => 'ok',
			'plugin'             => 'saas-connector',
			'pluginVersion'      => SAAS_CONNECTOR_VERSION,
			'connected'          => Saas_Connector_Settings::is_connected(),
			'storeConfigured'    => '' !== Saas_Connector_Settings::get( 'api_url' ),
			'woocommerceActive'  => class_exists( 'WooCommerce' ),
			'timestamp'          => gmdate( 'c' ),
		);

		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => $data,
				'message' => '',
			),
			200
		);
	}
}
