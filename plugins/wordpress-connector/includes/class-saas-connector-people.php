<?php
/**
 * Customer write-back and review moderation endpoints (Phase 29, plan3).
 *
 * Customers: field-allowlisted edits of name/phone/billing/shipping via the
 * WooCommerce customer object. NEVER touches user_login, user_pass, email-login
 * or roles (a red line — that is WP user administration).
 *
 * Reviews: WordPress product comments — list, moderate (approve/hold/spam/
 * trash) and reply as the store.
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_People {

	/** Allowed billing/shipping address keys. */
	private static $address_keys = array(
		'first_name',
		'last_name',
		'company',
		'address_1',
		'address_2',
		'city',
		'state',
		'postcode',
		'country',
		'phone',
		'email',
	);

	/**
	 * REST permission callback — verifies the SaaS HMAC signature.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return true|WP_Error
	 */
	public function authorize( WP_REST_Request $request ) {
		return Saas_Connector_Signature::authorize_rest( $request );
	}

	/* ----------------------------- Customers ------------------------------ */

	/**
	 * PUT /customers/{id} — write allowlisted customer fields.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_customer( WP_REST_Request $request ) {
		$customer_id = absint( $request['id'] );
		if ( ! $customer_id ) {
			return new WP_Error( 'not_found', 'Customer not found.', array( 'status' => 404 ) );
		}
		$customer = new WC_Customer( $customer_id );
		if ( ! $customer->get_id() ) {
			return new WP_Error( 'not_found', 'Customer not found.', array( 'status' => 404 ) );
		}

		$version_check = Saas_Connector_Versioning::check( $request, $customer->get_date_modified() );
		if ( is_wp_error( $version_check ) ) {
			return $version_check;
		}

		$params = $request->get_json_params();
		$params = is_array( $params ) ? $params : array();

		if ( isset( $params['firstName'] ) ) {
			$customer->set_first_name( sanitize_text_field( (string) $params['firstName'] ) );
		}
		if ( isset( $params['lastName'] ) ) {
			$customer->set_last_name( sanitize_text_field( (string) $params['lastName'] ) );
		}
		if ( array_key_exists( 'phone', $params ) ) {
			$customer->set_billing_phone( $params['phone'] ? sanitize_text_field( (string) $params['phone'] ) : '' );
		}
		if ( isset( $params['billing'] ) && is_array( $params['billing'] ) ) {
			$this->apply_address( $customer, 'billing', $params['billing'] );
		}
		if ( isset( $params['shipping'] ) && is_array( $params['shipping'] ) ) {
			$this->apply_address( $customer, 'shipping', $params['shipping'] );
		}

		$customer->save();
		$customer = new WC_Customer( $customer_id );

		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => $this->customer_data( $customer ),
				'message' => 'Customer updated',
			),
			200
		);
	}

	/**
	 * Apply an allowlisted address object to a customer.
	 *
	 * @param WC_Customer         $customer Customer.
	 * @param string              $type     billing|shipping.
	 * @param array<string,mixed> $address  Incoming camelCase address.
	 */
	private function apply_address( WC_Customer $customer, $type, array $address ) {
		$map = array(
			'firstName' => 'first_name',
			'lastName'  => 'last_name',
			'company'   => 'company',
			'address1'  => 'address_1',
			'address2'  => 'address_2',
			'city'      => 'city',
			'state'     => 'state',
			'postcode'  => 'postcode',
			'country'   => 'country',
			'phone'     => 'phone',
			'email'     => 'email',
		);
		foreach ( $map as $camel => $snake ) {
			if ( ! array_key_exists( $camel, $address ) ) {
				continue;
			}
			if ( ! in_array( $snake, self::$address_keys, true ) ) {
				continue;
			}
			$value  = 'email' === $snake
				? sanitize_email( (string) $address[ $camel ] )
				: sanitize_text_field( (string) $address[ $camel ] );
			$setter = "set_{$type}_{$snake}";
			if ( is_callable( array( $customer, $setter ) ) ) {
				$customer->{$setter}( $value );
			}
		}
	}

	/**
	 * Normalized customer data (non-sensitive: no password/login).
	 *
	 * @param WC_Customer $customer Customer.
	 * @return array<string,mixed>
	 */
	private function customer_data( WC_Customer $customer ) {
		$name = trim( $customer->get_first_name() . ' ' . $customer->get_last_name() );
		return array(
			'wpCustomerId' => $customer->get_id(),
			'name'         => '' !== $name ? $name : $customer->get_display_name(),
			'phone'        => $customer->get_billing_phone(),
			'billing'      => $this->read_address( $customer, 'billing' ),
			'shipping'     => $this->read_address( $customer, 'shipping' ),
			'dateModified' => Saas_Connector_Versioning::version_of( $customer->get_date_modified() ),
		);
	}

	/**
	 * Read an address object from a customer.
	 *
	 * @param WC_Customer $customer Customer.
	 * @param string      $type     billing|shipping.
	 * @return array<string,string>
	 */
	private function read_address( WC_Customer $customer, $type ) {
		$out = array();
		foreach ( self::$address_keys as $key ) {
			$getter = "get_{$type}_{$key}";
			if ( is_callable( array( $customer, $getter ) ) ) {
				$out[ $key ] = (string) $customer->{$getter}();
			}
		}
		return $out;
	}

	/* ------------------------------ Reviews ------------------------------- */

	/**
	 * Map a moderation status onto a WordPress comment status.
	 *
	 * @param string $status approved|hold|spam|trash.
	 * @return string|null
	 */
	private function comment_status( $status ) {
		$map = array(
			'approved' => 'approve',
			'hold'     => 'hold',
			'spam'     => 'spam',
			'trash'    => 'trash',
		);
		return isset( $map[ $status ] ) ? $map[ $status ] : null;
	}

	/**
	 * GET /reviews — paginated product reviews.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response
	 */
	public function list_reviews( WP_REST_Request $request ) {
		$page     = max( 1, (int) $request->get_param( 'page' ) );
		$per_page = min( 100, max( 1, (int) $request->get_param( 'per_page' ) ) );
		$status   = (string) $request->get_param( 'status' );

		$args = array(
			'post_type'   => 'product',
			'type'        => 'review',
			'number'      => $per_page,
			'paged'       => $page,
			'status'      => $this->query_status( $status ),
			'count'       => false,
		);

		$comments = get_comments( $args );
		$items    = array();
		foreach ( (array) $comments as $comment ) {
			$items[] = $this->review_data( $comment );
		}

		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array(
					'items'      => $items,
					'page'       => $page,
					'totalPages' => count( $items ) < $per_page ? $page : $page + 1,
				),
				'message' => '',
			),
			200
		);
	}

	/**
	 * Translate a SaaS review status to a get_comments status.
	 *
	 * @param string $status Requested status ('' = all).
	 * @return string
	 */
	private function query_status( $status ) {
		switch ( $status ) {
			case 'approved':
				return 'approve';
			case 'hold':
				return 'hold';
			case 'spam':
				return 'spam';
			case 'trash':
				return 'trash';
			default:
				return 'all';
		}
	}

	/**
	 * PUT /reviews/{id} — moderate a review.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function moderate_review( WP_REST_Request $request ) {
		$comment_id = absint( $request['id'] );
		$comment    = $comment_id ? get_comment( $comment_id ) : null;
		if ( ! $comment ) {
			return new WP_Error( 'not_found', 'Review not found.', array( 'status' => 404 ) );
		}
		$params = $request->get_json_params();
		$params = is_array( $params ) ? $params : array();
		$status = isset( $params['status'] ) ? sanitize_key( (string) $params['status'] ) : '';
		$mapped = $this->comment_status( $status );
		if ( null === $mapped ) {
			return new WP_Error( 'invalid_status', 'Unknown review status.', array( 'status' => 400 ) );
		}
		wp_set_comment_status( $comment_id, $mapped );

		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => $this->review_data( get_comment( $comment_id ) ),
				'message' => 'Review moderated',
			),
			200
		);
	}

	/**
	 * POST /reviews/{id}/reply — reply as the store (threaded comment).
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function reply_review( WP_REST_Request $request ) {
		$comment_id = absint( $request['id'] );
		$comment    = $comment_id ? get_comment( $comment_id ) : null;
		if ( ! $comment ) {
			return new WP_Error( 'not_found', 'Review not found.', array( 'status' => 404 ) );
		}
		$params = $request->get_json_params();
		$params = is_array( $params ) ? $params : array();
		$reply  = isset( $params['reply'] ) ? sanitize_textarea_field( (string) $params['reply'] ) : '';
		if ( '' === $reply ) {
			return new WP_Error( 'invalid_reply', 'Reply text is required.', array( 'status' => 400 ) );
		}

		$reply_id = wp_insert_comment(
			array(
				'comment_post_ID'      => $comment->comment_post_ID,
				'comment_content'      => $reply,
				'comment_parent'       => $comment_id,
				'comment_approved'     => 1,
				'comment_type'         => 'comment',
				'user_id'              => get_current_user_id(),
				'comment_author'       => get_bloginfo( 'name' ),
			)
		);
		if ( ! $reply_id ) {
			return new WP_Error( 'reply_failed', 'Failed to post the reply.', array( 'status' => 500 ) );
		}

		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array( 'wpCommentId' => (int) $reply_id ),
				'message' => 'Reply posted',
			),
			201
		);
	}

	/**
	 * Normalized review data.
	 *
	 * @param WP_Comment $comment Comment.
	 * @return array<string,mixed>
	 */
	private function review_data( $comment ) {
		$rating     = (int) get_comment_meta( $comment->comment_ID, 'rating', true );
		$product_id = (int) $comment->comment_post_ID;
		return array(
			'wpReviewId'   => (int) $comment->comment_ID,
			'wpProductId'  => $product_id,
			'productName'  => get_the_title( $product_id ),
			'author'       => $comment->comment_author,
			'authorEmail'  => $comment->comment_author_email,
			'rating'       => $rating,
			'content'      => wp_trim_words( $comment->comment_content, 60 ),
			'status'       => $this->review_status( $comment ),
			'dateCreated'  => mysql2date( 'c', $comment->comment_date_gmt ),
			'dateModified' => (string) strtotime( $comment->comment_date_gmt ),
		);
	}

	/**
	 * Derive a SaaS review status from a comment.
	 *
	 * @param WP_Comment $comment Comment.
	 * @return string
	 */
	private function review_status( $comment ) {
		if ( '1' === (string) $comment->comment_approved || 'approve' === $comment->comment_approved ) {
			return 'approved';
		}
		if ( 'spam' === $comment->comment_approved ) {
			return 'spam';
		}
		if ( 'trash' === $comment->comment_approved ) {
			return 'trash';
		}
		return 'hold';
	}
}
