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
		// Phase 27: wp-admin refunds must reach the mirror too. The normalized
		// order payload carries the refunds array, so the regular order.updated
		// upsert path keeps the SaaS refund mirror honest.
		add_action( 'woocommerce_order_refunded', array( $this, 'on_order_refunded' ), 20, 1 );
		add_action( 'user_register', array( $this, 'on_user_register' ), 20, 1 );
		add_action( 'profile_update', array( $this, 'on_profile_update' ), 20, 1 );
		// Phase 31: coupon + review parity webhooks.
		add_action( 'save_post_shop_coupon', array( $this, 'on_coupon_saved' ), 20, 3 );
		add_action( 'before_delete_post', array( $this, 'on_post_deleted' ), 20, 1 );
		add_action( 'wp_insert_comment', array( $this, 'on_comment_inserted' ), 20, 2 );
		add_action( 'edit_comment', array( $this, 'on_comment_edited' ), 20, 1 );
		add_action( 'transition_comment_status', array( $this, 'on_comment_status' ), 20, 3 );
	}

	/* ------------------------------ Coupons ------------------------------- */

	/**
	 * save_post_shop_coupon handler.
	 *
	 * @param int     $post_id Coupon post id.
	 * @param WP_Post $post    Post.
	 * @param bool    $update  Whether this is an update.
	 */
	public function on_coupon_saved( $post_id, $post, $update ) {
		if ( wp_is_post_revision( $post_id ) || 'auto-draft' === $post->post_status ) {
			return;
		}
		if ( ! function_exists( 'WC' ) || ! class_exists( 'WC_Coupon' ) ) {
			return;
		}
		$coupon = new WC_Coupon( $post_id );
		if ( ! $coupon->get_id() ) {
			return;
		}
		$this->send(
			'coupons',
			$update ? 'coupon.updated' : 'coupon.created',
			$post_id,
			$this->coupon_payload( $coupon ),
			Saas_Connector_Versioning::version_of( $coupon->get_date_modified() )
		);
	}

	/**
	 * before_delete_post handler — fires coupon.deleted for shop_coupon posts.
	 *
	 * @param int $post_id Post id.
	 */
	public function on_post_deleted( $post_id ) {
		if ( 'shop_coupon' === get_post_type( $post_id ) ) {
			$this->send( 'coupons', 'coupon.deleted', $post_id, null );
		}
	}

	/**
	 * Normalized coupon payload for webhooks (mirrors the SaaS coupon schema).
	 *
	 * @param WC_Coupon $coupon Coupon.
	 * @return array<string,mixed>
	 */
	private function coupon_payload( WC_Coupon $coupon ) {
		$expires = $coupon->get_date_expires();
		return array(
			'wpCouponId'        => $coupon->get_id(),
			'code'              => $coupon->get_code(),
			'discountType'      => $coupon->get_discount_type(),
			'amount'            => (string) $coupon->get_amount(),
			'description'       => $coupon->get_description(),
			'freeShipping'      => (bool) $coupon->get_free_shipping(),
			'usageCount'        => (int) $coupon->get_usage_count(),
			'usageLimit'        => $coupon->get_usage_limit() ? (int) $coupon->get_usage_limit() : null,
			'usageLimitPerUser' => $coupon->get_usage_limit_per_user() ? (int) $coupon->get_usage_limit_per_user() : null,
			'dateExpires'       => $expires ? $expires->date( 'Y-m-d' ) : null,
			'dateModified'      => Saas_Connector_Versioning::version_of( $coupon->get_date_modified() ),
		);
	}

	/* ------------------------------ Reviews ------------------------------- */

	/**
	 * wp_insert_comment handler.
	 *
	 * @param int        $comment_id Comment id.
	 * @param WP_Comment $comment    Comment.
	 */
	public function on_comment_inserted( $comment_id, $comment ) {
		if ( $this->is_review( $comment ) ) {
			$this->send( 'reviews', 'review.created', $comment_id, $this->review_payload( $comment ) );
		}
	}

	/**
	 * edit_comment handler.
	 *
	 * @param int $comment_id Comment id.
	 */
	public function on_comment_edited( $comment_id ) {
		$comment = get_comment( $comment_id );
		if ( $comment && $this->is_review( $comment ) ) {
			$this->send( 'reviews', 'review.updated', $comment_id, $this->review_payload( $comment ) );
		}
	}

	/**
	 * transition_comment_status handler.
	 *
	 * @param string     $new_status New status.
	 * @param string     $old_status Old status.
	 * @param WP_Comment $comment    Comment.
	 */
	public function on_comment_status( $new_status, $old_status, $comment ) {
		if ( $this->is_review( $comment ) ) {
			$this->send( 'reviews', 'review.updated', $comment->comment_ID, $this->review_payload( $comment ) );
		}
	}

	/**
	 * Whether a comment is a product review.
	 *
	 * @param WP_Comment $comment Comment.
	 * @return bool
	 */
	private function is_review( $comment ) {
		return $comment && 'product' === get_post_type( $comment->comment_post_ID );
	}

	/**
	 * Normalized review payload (mirrors the SaaS review schema).
	 *
	 * @param WP_Comment $comment Comment.
	 * @return array<string,mixed>
	 */
	private function review_payload( $comment ) {
		$product_id = (int) $comment->comment_post_ID;
		$status     = 'hold';
		if ( '1' === (string) $comment->comment_approved || 'approve' === $comment->comment_approved ) {
			$status = 'approved';
		} elseif ( 'spam' === $comment->comment_approved ) {
			$status = 'spam';
		} elseif ( 'trash' === $comment->comment_approved ) {
			$status = 'trash';
		}
		return array(
			'wpReviewId'   => (int) $comment->comment_ID,
			'wpProductId'  => $product_id,
			'productName'  => get_the_title( $product_id ),
			'author'       => $comment->comment_author,
			'authorEmail'  => $comment->comment_author_email,
			'rating'       => (int) get_comment_meta( $comment->comment_ID, 'rating', true ),
			'content'      => wp_trim_words( $comment->comment_content, 60 ),
			'status'       => $status,
			'dateCreated'  => mysql2date( 'c', $comment->comment_date_gmt ),
			'dateModified' => (string) strtotime( $comment->comment_date_gmt ),
		);
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
			Saas_Connector_Normalize::product( $product ),
			Saas_Connector_Versioning::version_of( $product->get_date_modified() )
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
	 * woocommerce_order_refunded handler (Phase 27).
	 *
	 * @param int $order_id Order id.
	 */
	public function on_order_refunded( $order_id ) {
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
				Saas_Connector_Normalize::order( $order ),
				Saas_Connector_Versioning::version_of( $order->get_date_modified() )
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
	 * @param string                   $entity         products|orders|customers.
	 * @param string                   $event          Event topic.
	 * @param int|string               $external_id    WooCommerce id of the entity.
	 * @param array<string,mixed>|null $data           Normalized entity payload.
	 * @param string                   $entity_version Version token ('' when unknown).
	 */
	private function send( $entity, $event, $external_id, $data, $entity_version = '' ) {
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
		if ( '' !== $entity_version ) {
			$payload['entityVersion'] = $entity_version;
		}

		// Phase 25 echo marker: when this request was caused by a SaaS command,
		// stamp its id so the SaaS confirms the command instead of re-processing.
		$origin = Saas_Connector_Echo::current_command_id();
		if ( '' !== $origin ) {
			$payload['originCommandId'] = $origin;
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
