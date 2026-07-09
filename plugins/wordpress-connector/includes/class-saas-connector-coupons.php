<?php
/**
 * Coupon write/read endpoints called by the SaaS (Phase 28, plan3).
 *
 * Full coupon CRUD wrapping WC_Coupon, plus a paginated read for sync. HMAC
 * verified; thin. Compare-and-set aware on update.
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_Coupons {

	/**
	 * REST permission callback — verifies the SaaS HMAC signature.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return true|WP_Error
	 */
	public function authorize( WP_REST_Request $request ) {
		return Saas_Connector_Signature::authorize_rest( $request );
	}

	/**
	 * POST /coupons — create a coupon.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function create_coupon( WP_REST_Request $request ) {
		$params = $request->get_json_params();
		$params = is_array( $params ) ? $params : array();
		$code   = isset( $params['code'] ) ? wc_sanitize_coupon_code( (string) $params['code'] ) : '';
		if ( '' === $code ) {
			return new WP_Error( 'invalid_code', 'A coupon code is required.', array( 'status' => 400 ) );
		}
		if ( wc_get_coupon_id_by_code( $code ) ) {
			return new WP_Error( 'duplicate_code', 'A coupon with this code already exists.', array( 'status' => 409 ) );
		}

		$coupon = new WC_Coupon();
		$coupon->set_code( $code );
		$this->apply_payload( $coupon, $params );
		$coupon->save();

		return $this->respond( $coupon, 'Coupon created', 201 );
	}

	/**
	 * PUT /coupons/{id} — update a coupon (compare-and-set aware).
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_coupon( WP_REST_Request $request ) {
		$coupon_id = absint( $request['id'] );
		$coupon    = $coupon_id ? new WC_Coupon( $coupon_id ) : false;
		if ( ! $coupon || ! $coupon->get_id() ) {
			return new WP_Error( 'not_found', 'Coupon not found.', array( 'status' => 404 ) );
		}

		$version_check = Saas_Connector_Versioning::check( $request, $coupon->get_date_modified() );
		if ( is_wp_error( $version_check ) ) {
			return $version_check;
		}

		$params = $request->get_json_params();
		$params = is_array( $params ) ? $params : array();
		$this->apply_payload( $coupon, $params );
		$coupon->save();

		return $this->respond( $coupon, 'Coupon updated', 200 );
	}

	/**
	 * DELETE /coupons/{id} — delete a coupon.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function delete_coupon( WP_REST_Request $request ) {
		$coupon_id = absint( $request['id'] );
		$coupon    = $coupon_id ? new WC_Coupon( $coupon_id ) : false;
		if ( ! $coupon || ! $coupon->get_id() ) {
			return new WP_Error( 'not_found', 'Coupon not found.', array( 'status' => 404 ) );
		}
		$params = $request->get_json_params();
		$force  = is_array( $params ) && ! empty( $params['force'] );
		wp_delete_post( $coupon_id, $force );

		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array( 'wpCouponId' => $coupon_id, 'deleted' => true ),
				'message' => 'Coupon deleted',
			),
			200
		);
	}

	/**
	 * GET /sync/coupons — paginated coupon read for the SaaS mirror.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response
	 */
	public function list_coupons( WP_REST_Request $request ) {
		$page     = max( 1, (int) $request->get_param( 'page' ) );
		$per_page = min( 100, max( 1, (int) $request->get_param( 'per_page' ) ) );

		$query = new WP_Query(
			array(
				'post_type'      => 'shop_coupon',
				'post_status'    => 'publish',
				'posts_per_page' => $per_page,
				'paged'          => $page,
				'orderby'        => 'ID',
				'order'          => 'ASC',
				'fields'         => 'ids',
			)
		);

		$items = array();
		foreach ( $query->posts as $coupon_id ) {
			$items[] = $this->coupon_data( new WC_Coupon( (int) $coupon_id ) );
		}

		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array(
					'items'      => $items,
					'page'       => $page,
					'totalPages' => (int) $query->max_num_pages,
				),
				'message' => '',
			),
			200
		);
	}

	/**
	 * Apply the writable coupon fields from the request.
	 *
	 * @param WC_Coupon           $coupon Coupon.
	 * @param array<string,mixed> $params Request params.
	 */
	private function apply_payload( WC_Coupon $coupon, array $params ) {
		if ( isset( $params['discountType'] ) ) {
			$coupon->set_discount_type( sanitize_text_field( (string) $params['discountType'] ) );
		}
		if ( isset( $params['amount'] ) ) {
			$coupon->set_amount( wc_format_decimal( (string) $params['amount'] ) );
		}
		if ( array_key_exists( 'description', $params ) ) {
			$coupon->set_description( sanitize_textarea_field( (string) $params['description'] ) );
		}
		if ( isset( $params['freeShipping'] ) ) {
			$coupon->set_free_shipping( (bool) $params['freeShipping'] );
		}
		if ( array_key_exists( 'usageLimit', $params ) ) {
			$coupon->set_usage_limit( $params['usageLimit'] ? absint( $params['usageLimit'] ) : '' );
		}
		if ( array_key_exists( 'usageLimitPerUser', $params ) ) {
			$coupon->set_usage_limit_per_user( $params['usageLimitPerUser'] ? absint( $params['usageLimitPerUser'] ) : '' );
		}
		if ( array_key_exists( 'dateExpires', $params ) ) {
			$coupon->set_date_expires( $params['dateExpires'] ? sanitize_text_field( (string) $params['dateExpires'] ) : null );
		}
		if ( array_key_exists( 'minimumAmount', $params ) ) {
			$coupon->set_minimum_amount( $params['minimumAmount'] ? wc_format_decimal( (string) $params['minimumAmount'] ) : '' );
		}
		if ( array_key_exists( 'maximumAmount', $params ) ) {
			$coupon->set_maximum_amount( $params['maximumAmount'] ? wc_format_decimal( (string) $params['maximumAmount'] ) : '' );
		}
		if ( isset( $params['individualUse'] ) ) {
			$coupon->set_individual_use( (bool) $params['individualUse'] );
		}
		if ( isset( $params['excludeSaleItems'] ) ) {
			$coupon->set_exclude_sale_items( (bool) $params['excludeSaleItems'] );
		}
		if ( isset( $params['productIds'] ) && is_array( $params['productIds'] ) ) {
			$coupon->set_product_ids( array_map( 'absint', $params['productIds'] ) );
		}
		if ( isset( $params['excludedProductIds'] ) && is_array( $params['excludedProductIds'] ) ) {
			$coupon->set_excluded_product_ids( array_map( 'absint', $params['excludedProductIds'] ) );
		}
		if ( isset( $params['productCategoryIds'] ) && is_array( $params['productCategoryIds'] ) ) {
			$coupon->set_product_categories( array_map( 'absint', $params['productCategoryIds'] ) );
		}
		if ( isset( $params['excludedProductCategoryIds'] ) && is_array( $params['excludedProductCategoryIds'] ) ) {
			$coupon->set_excluded_product_categories( array_map( 'absint', $params['excludedProductCategoryIds'] ) );
		}
		if ( isset( $params['emailRestrictions'] ) && is_array( $params['emailRestrictions'] ) ) {
			$coupon->set_email_restrictions( array_map( 'sanitize_email', $params['emailRestrictions'] ) );
		}
	}

	/**
	 * Normalized coupon data (shared by write responses and sync).
	 *
	 * @param WC_Coupon $coupon Coupon.
	 * @return array<string,mixed>
	 */
	private function coupon_data( WC_Coupon $coupon ) {
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
			'restrictions'      => array(
				'minimumAmount'              => (string) $coupon->get_minimum_amount(),
				'maximumAmount'              => (string) $coupon->get_maximum_amount(),
				'individualUse'             => (bool) $coupon->get_individual_use(),
				'excludeSaleItems'          => (bool) $coupon->get_exclude_sale_items(),
				'productIds'                => array_map( 'intval', $coupon->get_product_ids() ),
				'excludedProductIds'        => array_map( 'intval', $coupon->get_excluded_product_ids() ),
				'productCategoryIds'        => array_map( 'intval', $coupon->get_product_categories() ),
				'excludedProductCategoryIds' => array_map( 'intval', $coupon->get_excluded_product_categories() ),
				'emailRestrictions'         => $coupon->get_email_restrictions(),
			),
			'dateModified'      => Saas_Connector_Versioning::version_of( $coupon->get_date_modified() ),
		);
	}

	/**
	 * Success envelope for a saved coupon.
	 *
	 * @param WC_Coupon $coupon  Coupon.
	 * @param string    $message Message.
	 * @param int       $status  HTTP status.
	 * @return WP_REST_Response
	 */
	private function respond( WC_Coupon $coupon, $message, $status ) {
		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => $this->coupon_data( $coupon ),
				'message' => $message,
			),
			$status
		);
	}
}
