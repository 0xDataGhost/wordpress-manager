<?php
/**
 * Real-time webhook sender (Phase 13 — incremental sync).
 *
 * Listens to a small, fixed set of WooCommerce/WordPress actions and forwards a
 * normalized event envelope to the SaaS webhook endpoints. Deliberately thin:
 * the connector only detects the change, normalizes the entity (via
 * Saas_Connector_Normalize) and fires one HTTP POST. All sync/upsert business
 * logic stays on the SaaS. No advanced retry and no extra UI — failures are
 * logged in debug mode and the SaaS records every received event for replay.
 *
 * Handled actions:
 *   woocommerce_update_product     -> product.updated
 *   woocommerce_product_set_stock  -> product.updated
 *   woocommerce_new_order          -> order.created
 *   woocommerce_update_order       -> order.updated
 *   user_register                  -> customer.created (WooCommerce customers only)
 *   profile_update                 -> customer.updated (WooCommerce customers only)
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_Webhooks {

	/**
	 * Hook the WooCommerce/WordPress actions this connector forwards.
	 */
	public function register() {
		add_action( 'woocommerce_update_product', array( $this, 'on_product_updated' ), 20, 1 );
		add_action( 'woocommerce_product_set_stock', array( $this, 'on_product_stock' ), 20, 1 );
		add_action( 'woocommerce_new_order', array( $this, 'on_order_created' ), 20, 1 );
		add_action( 'woocommerce_update_order', array( $this, 'on_order_updated' ), 20, 1 );
		add_action( 'user_register', array( $this, 'on_user_register' ), 20, 1 );
		add_action( 'profile_update', array( $this, 'on_profile_update' ), 20, 1 );
	}

	/* ----------------------------- Products ------------------------------- */

	/**
	 * woocommerce_update_product handler.
	 *
	 * @param int $product_id Product id.
	 */
	public function on_product_updated( $product_id ) {
		$this->send_product( (int) $product_id, 'product.updated' );
	}

	/**
	 * woocommerce_product_set_stock handler (receives the product object).
	 *
	 * @param mixed $product Product whose stock changed.
	 */
	public function on_product_stock( $product ) {
		if ( $product instanceof WC_Product ) {
			$this->send_product_object( $product, 'product.updated' );
		}
	}

	/**
	 * Resolve a product by id and forward the event.
	 *
	 * @param int    $product_id Product id.
	 * @param string $event      Event topic.
	 */
	private function send_product( $product_id, $event ) {
		if ( ! $product_id || ! function_exists( 'wc_get_product' ) ) {
			return;
		}
		$product = wc_get_product( $product_id );
		if ( $product instanceof WC_Product ) {
			$this->send_product_object( $product, $event );
		}
	}

	/**
	 * Normalize and forward a product event.
	 *
	 * @param WC_Product $product Product.
	 * @param string     $event   Event topic.
	 */
	private function send_product_object( WC_Product $product, $event ) {
		$this->send(
			'products',
			$event,
			$product->get_id(),
			Saas_Connector_Normalize::product( $product )
		);
	}

	/* ------------------------------ Orders -------------------------------- */

	/**
	 * woocommerce_new_order handler.
	 *
	 * @param int $order_id Order id.
	 */
	public function on_order_created( $order_id ) {
		$this->send_order( (int) $order_id, 'order.created' );
	}

	/**
	 * woocommerce_update_order handler.
	 *
	 * @param int $order_id Order id.
	 */
	public function on_order_updated( $order_id ) {
		$this->send_order( (int) $order_id, 'order.updated' );
	}

	/**
	 * Resolve an order by id and forward the event.
	 *
	 * @param int    $order_id Order id.
	 * @param string $event    Event topic.
	 */
	private function send_order( $order_id, $event ) {
		if ( ! $order_id || ! function_exists( 'wc_get_order' ) ) {
			return;
		}
		$order = wc_get_order( $order_id );
		if ( $order instanceof WC_Order ) {
			$this->send(
				'orders',
				$event,
				$order->get_id(),
				Saas_Connector_Normalize::order( $order )
			);
		}
	}

	/* ----------------------------- Customers ------------------------------ */

	/**
	 * user_register handler.
	 *
	 * @param int $user_id User id.
	 */
	public function on_user_register( $user_id ) {
		$this->send_customer( (int) $user_id, 'customer.created' );
	}

	/**
	 * profile_update handler.
	 *
	 * @param int $user_id User id.
	 */
	public function on_profile_update( $user_id ) {
		$this->send_customer( (int) $user_id, 'customer.updated' );
	}

	/**
	 * Forward a customer event, but only for WooCommerce customers — these hooks
	 * fire for every user (admins, editors, ...), so non-customers are skipped to
	 * match the read-sync endpoint's role=customer scope.
	 *
	 * @param int    $user_id User id.
	 * @param string $event   Event topic.
	 */
	private function send_customer( $user_id, $event ) {
		if ( ! $user_id ) {
			return;
		}
		$user = get_userdata( $user_id );
		if ( ! $user || ! in_array( 'customer', (array) $user->roles, true ) ) {
			return;
		}
		$this->send(
			'customers',
			$event,
			$user_id,
			Saas_Connector_Normalize::customer( $user )
		);
	}

	/* ------------------------------ Delivery ------------------------------ */

	/**
	 * Build the envelope and POST it to the SaaS. No-op when the store is not
	 * connected or credentials are missing, so hooks stay cheap on every save.
	 *
	 * @param string                   $entity      products|orders|customers.
	 * @param string                   $event       Event topic.
	 * @param int|string               $external_id WooCommerce id of the entity.
	 * @param array<string,mixed>|null $data        Normalized entity payload.
	 */
	private function send( $entity, $event, $external_id, $data ) {
		if ( ! Saas_Connector_Settings::is_connected() ) {
			return;
		}
		$api_url = Saas_Connector_Settings::get( 'api_url' );
		$api_key = Saas_Connector_Settings::get( 'api_key' );
		if ( '' === $api_url || '' === $api_key ) {
			return;
		}

		$payload = array(
			'event'      => $event,
			'eventId'    => $this->event_id( $event, $external_id ),
			'externalId' => (string) $external_id,
			'occurredAt' => gmdate( 'c' ),
		);
		if ( null !== $data ) {
			$payload['data'] = $data;
		}

		$result = Saas_Connector_Api_Client::send_webhook( $api_url, $api_key, $entity, $payload );

		if ( empty( $result['ok'] ) && defined( 'WP_DEBUG' ) && WP_DEBUG ) {
			$message = isset( $result['message'] ) ? (string) $result['message'] : 'unknown error';
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( sprintf( '[saas-connector] webhook %s delivery failed: %s', $event, $message ) );
		}
	}

	/**
	 * Build the idempotency key for a delivery. Stable within a single request so
	 * actions that fire more than once per save collapse to one event on the SaaS
	 * (deduped), while distinct requests produce distinct events.
	 *
	 * @param string     $event       Event topic.
	 * @param int|string $external_id WooCommerce id.
	 * @return string
	 */
	private function event_id( $event, $external_id ) {
		return $event . ':' . $external_id . ':' . self::request_nonce();
	}

	/**
	 * A short token unique to the current PHP request (memoized).
	 *
	 * @return string
	 */
	private static function request_nonce() {
		static $nonce = null;
		if ( null === $nonce ) {
			$seed  = function_exists( 'wp_rand' ) ? (string) wp_rand() : (string) mt_rand();
			$nonce = substr( md5( uniqid( $seed, true ) ), 0, 12 );
		}
		return $nonce;
	}
}
