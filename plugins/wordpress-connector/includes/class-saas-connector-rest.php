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

	/**
	 * Digital delivery note handler.
	 *
	 * @var Saas_Connector_Delivery
	 */
	private $delivery;

	/**
	 * Capability handshake handler (Phase 25).
	 *
	 * @var Saas_Connector_Capabilities
	 */
	private $capabilities;

	/**
	 * Order write endpoints handler (Phase 27).
	 *
	 * @var Saas_Connector_Orders
	 */
	private $orders;

	/**
	 * Catalog write endpoints handler (Phase 26).
	 *
	 * @var Saas_Connector_Catalog
	 */
	private $catalog;

	/**
	 * Coupon endpoints handler (Phase 28).
	 *
	 * @var Saas_Connector_Coupons
	 */
	private $coupons;

	/**
	 * Customer/review endpoints handler (Phase 29).
	 *
	 * @var Saas_Connector_People
	 */
	private $people;

	/**
	 * Store configuration endpoints handler (Phase 30).
	 *
	 * @var Saas_Connector_Config
	 */
	private $config;

	/**
	 * Reconciliation count endpoints handler (Phase 31).
	 *
	 * @var Saas_Connector_Counts
	 */
	private $counts;

	public function __construct() {
		$this->products     = new Saas_Connector_Products();
		$this->sync         = new Saas_Connector_Sync();
		$this->delivery     = new Saas_Connector_Delivery();
		$this->capabilities = new Saas_Connector_Capabilities();
		$this->orders       = new Saas_Connector_Orders();
		$this->catalog      = new Saas_Connector_Catalog();
		$this->coupons      = new Saas_Connector_Coupons();
		$this->people       = new Saas_Connector_People();
		$this->config       = new Saas_Connector_Config();
		$this->counts       = new Saas_Connector_Counts();
	}

	/**
	 * Wrap a mutating callback with the Phase 25 idempotency store: a replayed
	 * X-Saas-Idempotency-Key returns the stored result without re-applying.
	 *
	 * @param callable $callback Original REST callback.
	 * @return callable
	 */
	private function idempotent( $callback ) {
		return function ( WP_REST_Request $request ) use ( $callback ) {
			return Saas_Connector_Idempotency::wrap( $request, $callback );
		};
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

		// Phase 25: the connector's capability handshake (signed; no WooCommerce
		// requirement so the SaaS can always interrogate the site's state).
		register_rest_route(
			self::NAMESPACE,
			'/capabilities',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this->capabilities, 'get_capabilities' ),
				'permission_callback' => array( $this->capabilities, 'authorize' ),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/products',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => $this->idempotent( array( $this->products, 'create_product' ) ),
				'permission_callback' => array( $this->products, 'authorize' ),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/products/(?P<id>\d+)',
			array(
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => $this->idempotent( array( $this->products, 'update_product' ) ),
					'permission_callback' => array( $this->products, 'authorize' ),
					'args'                => array(
						'id' => array(
							'validate_callback' => static function ( $value ) {
								return is_numeric( $value );
							},
						),
					),
				),
				// Phase 26: DELETE a product (trash by default; force to remove).
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => $this->idempotent( array( $this->catalog, 'delete_product' ) ),
					'permission_callback' => array( $this->catalog, 'authorize' ),
					'args'                => array(
						'id' => array(
							'validate_callback' => static function ( $value ) {
								return is_numeric( $value );
							},
						),
					),
				),
			)
		);

		$this->register_catalog_routes();
		$this->register_coupon_routes();
		$this->register_people_routes();
		$this->register_config_routes();
		$this->register_reconcile_routes();

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

		// Phase 18: digital delivery note. The SaaS posts a safe "codes ready"
		// note (no codes) when a digital order is delivered.
		register_rest_route(
			self::NAMESPACE,
			'/orders/(?P<id>\d+)/digital-note',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => $this->idempotent( array( $this->delivery, 'add_digital_note' ) ),
				'permission_callback' => array( $this->delivery, 'authorize' ),
				'args'                => array(
					'id' => array(
						'validate_callback' => static function ( $value ) {
							return is_numeric( $value );
						},
					),
				),
			)
		);

		// Phase 27: order management write-back (status, notes, refunds).
		$order_id_args = array(
			'id' => array(
				'validate_callback' => static function ( $value ) {
					return is_numeric( $value );
				},
			),
		);

		register_rest_route(
			self::NAMESPACE,
			'/orders/(?P<id>\d+)/status',
			array(
				'methods'             => WP_REST_Server::EDITABLE,
				'callback'            => $this->idempotent( array( $this->orders, 'update_status' ) ),
				'permission_callback' => array( $this->orders, 'authorize' ),
				'args'                => $order_id_args,
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/orders/(?P<id>\d+)/notes',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this->orders, 'list_notes' ),
					'permission_callback' => array( $this->orders, 'authorize' ),
					'args'                => $order_id_args,
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => $this->idempotent( array( $this->orders, 'add_note' ) ),
					'permission_callback' => array( $this->orders, 'authorize' ),
					'args'                => $order_id_args,
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/orders/(?P<id>\d+)/refunds',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this->orders, 'list_refunds' ),
					'permission_callback' => array( $this->orders, 'authorize' ),
					'args'                => $order_id_args,
				),
				array(
					// NOT wrapped in the generic idempotency store — refunds
					// implement their own domain idempotency (see the class).
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this->orders, 'create_refund' ),
					'permission_callback' => array( $this->orders, 'authorize' ),
					'args'                => $order_id_args,
				),
			)
		);
	}

	/**
	 * Register the Phase 26 catalog routes (variations, taxonomies, media, bulk).
	 */
	private function register_catalog_routes() {
		$product_id_args = array(
			'id' => array(
				'validate_callback' => static function ( $value ) {
					return is_numeric( $value );
				},
			),
		);

		// Variations.
		register_rest_route(
			self::NAMESPACE,
			'/products/(?P<id>\d+)/variations',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => $this->idempotent( array( $this->catalog, 'create_variation' ) ),
				'permission_callback' => array( $this->catalog, 'authorize' ),
				'args'                => $product_id_args,
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/products/(?P<id>\d+)/variations/(?P<variationId>\d+)',
			array(
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => $this->idempotent( array( $this->catalog, 'update_variation' ) ),
					'permission_callback' => array( $this->catalog, 'authorize' ),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => $this->idempotent( array( $this->catalog, 'delete_variation' ) ),
					'permission_callback' => array( $this->catalog, 'authorize' ),
				),
			)
		);

		// Bulk product operations.
		register_rest_route(
			self::NAMESPACE,
			'/products/bulk',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => $this->idempotent( array( $this->catalog, 'bulk_update' ) ),
				'permission_callback' => array( $this->catalog, 'authorize' ),
			)
		);

		// Media sideload.
		register_rest_route(
			self::NAMESPACE,
			'/media',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => $this->idempotent( array( $this->catalog, 'create_media' ) ),
				'permission_callback' => array( $this->catalog, 'authorize' ),
			)
		);

		// Taxonomies (categories|tags|attributes).
		register_rest_route(
			self::NAMESPACE,
			'/taxonomies/(?P<taxonomy>[a-z]+)',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => $this->idempotent( array( $this->catalog, 'create_taxonomy' ) ),
				'permission_callback' => array( $this->catalog, 'authorize' ),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/taxonomies/(?P<taxonomy>[a-z]+)/(?P<id>\d+)',
			array(
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => $this->idempotent( array( $this->catalog, 'update_taxonomy' ) ),
					'permission_callback' => array( $this->catalog, 'authorize' ),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => $this->idempotent( array( $this->catalog, 'delete_taxonomy' ) ),
					'permission_callback' => array( $this->catalog, 'authorize' ),
				),
			)
		);
	}

	/**
	 * Register the Phase 28 coupon routes (CRUD + sync read).
	 */
	private function register_coupon_routes() {
		register_rest_route(
			self::NAMESPACE,
			'/coupons',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => $this->idempotent( array( $this->coupons, 'create_coupon' ) ),
				'permission_callback' => array( $this->coupons, 'authorize' ),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/coupons/(?P<id>\d+)',
			array(
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => $this->idempotent( array( $this->coupons, 'update_coupon' ) ),
					'permission_callback' => array( $this->coupons, 'authorize' ),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => $this->idempotent( array( $this->coupons, 'delete_coupon' ) ),
					'permission_callback' => array( $this->coupons, 'authorize' ),
				),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/sync/coupons',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this->coupons, 'list_coupons' ),
				'permission_callback' => array( $this->coupons, 'authorize' ),
			)
		);
	}

	/**
	 * Register the Phase 29 customer + review routes.
	 */
	private function register_people_routes() {
		register_rest_route(
			self::NAMESPACE,
			'/customers/(?P<id>\d+)',
			array(
				'methods'             => WP_REST_Server::EDITABLE,
				'callback'            => $this->idempotent( array( $this->people, 'update_customer' ) ),
				'permission_callback' => array( $this->people, 'authorize' ),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/reviews',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this->people, 'list_reviews' ),
				'permission_callback' => array( $this->people, 'authorize' ),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/reviews/(?P<id>\d+)',
			array(
				'methods'             => WP_REST_Server::EDITABLE,
				'callback'            => $this->idempotent( array( $this->people, 'moderate_review' ) ),
				'permission_callback' => array( $this->people, 'authorize' ),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/reviews/(?P<id>\d+)/reply',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => $this->idempotent( array( $this->people, 'reply_review' ) ),
				'permission_callback' => array( $this->people, 'authorize' ),
			)
		);
	}

	/**
	 * Register the Phase 30 store-config routes (settings, shipping, taxes,
	 * gateways). Gateway responses never include secret fields.
	 */
	private function register_config_routes() {
		$auth = array( $this->config, 'authorize' );

		register_rest_route(
			self::NAMESPACE,
			'/settings/(?P<group>[a-z_]+)',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this->config, 'get_settings' ),
					'permission_callback' => $auth,
				),
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => $this->idempotent( array( $this->config, 'update_settings' ) ),
					'permission_callback' => $auth,
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/shipping/zones',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this->config, 'get_shipping_zones' ),
					'permission_callback' => $auth,
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => $this->idempotent( array( $this->config, 'create_zone' ) ),
					'permission_callback' => $auth,
				),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/shipping/zones/(?P<zoneId>\d+)',
			array(
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => $this->idempotent( array( $this->config, 'update_zone' ) ),
					'permission_callback' => $auth,
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => $this->idempotent( array( $this->config, 'delete_zone' ) ),
					'permission_callback' => $auth,
				),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/shipping/zones/(?P<zoneId>\d+)/methods',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => $this->idempotent( array( $this->config, 'save_method' ) ),
				'permission_callback' => $auth,
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/shipping/zones/(?P<zoneId>\d+)/methods/(?P<methodId>\d+)',
			array(
				'methods'             => WP_REST_Server::DELETABLE,
				'callback'            => $this->idempotent( array( $this->config, 'delete_method' ) ),
				'permission_callback' => $auth,
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/taxes/rates',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this->config, 'get_tax_rates' ),
					'permission_callback' => $auth,
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => $this->idempotent( array( $this->config, 'create_tax_rate' ) ),
					'permission_callback' => $auth,
				),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/taxes/rates/(?P<rateId>\d+)',
			array(
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => $this->idempotent( array( $this->config, 'update_tax_rate' ) ),
					'permission_callback' => $auth,
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => $this->idempotent( array( $this->config, 'delete_tax_rate' ) ),
					'permission_callback' => $auth,
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/gateways',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this->config, 'get_gateways' ),
				'permission_callback' => $auth,
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/gateways/(?P<gatewayId>[a-z0-9_-]+)',
			array(
				'methods'             => WP_REST_Server::EDITABLE,
				'callback'            => $this->idempotent( array( $this->config, 'update_gateway' ) ),
				'permission_callback' => $auth,
			)
		);
	}

	/**
	 * Register the Phase 31 reconciliation routes (+ review sync read).
	 */
	private function register_reconcile_routes() {
		register_rest_route(
			self::NAMESPACE,
			'/counts/(?P<domain>[a-z]+)',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this->counts, 'get_count' ),
				'permission_callback' => array( $this->counts, 'authorize' ),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/sync/reviews',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this->people, 'list_reviews' ),
				'permission_callback' => array( $this->people, 'authorize' ),
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
