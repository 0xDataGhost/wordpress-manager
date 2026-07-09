<?php
/**
 * Reconciliation count endpoints (Phase 31, plan3).
 *
 * The SaaS asks for the CURRENT count of each domain in WooCommerce and
 * compares it to its mirror to detect drift from lost webhooks. Reads only.
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_Counts {

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
	 * GET /counts/{domain} — count of a domain in WooCommerce.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_count( WP_REST_Request $request ) {
		$domain = sanitize_key( (string) $request['domain'] );
		$count  = null;

		switch ( $domain ) {
			case 'product':
				$count = $this->post_count( 'product', array( 'publish', 'draft', 'private', 'pending' ) );
				break;
			case 'order':
				$count = $this->order_count();
				break;
			case 'customer':
				$count = $this->customer_count();
				break;
			case 'coupon':
				$count = $this->post_count( 'shop_coupon', array( 'publish' ) );
				break;
			case 'review':
				$count = $this->review_count();
				break;
			default:
				return new WP_Error( 'invalid_domain', 'Unknown domain.', array( 'status' => 400 ) );
		}

		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array( 'domain' => $domain, 'count' => (int) $count ),
				'message' => '',
			),
			200
		);
	}

	/**
	 * Count posts of a type across the given statuses.
	 *
	 * @param string   $type     Post type.
	 * @param string[] $statuses Statuses.
	 * @return int
	 */
	private function post_count( $type, array $statuses ) {
		$counts = (array) wp_count_posts( $type );
		$total  = 0;
		foreach ( $statuses as $status ) {
			if ( isset( $counts[ $status ] ) ) {
				$total += (int) $counts[ $status ];
			}
		}
		return $total;
	}

	/**
	 * Count WooCommerce orders across all core statuses (HPOS-aware).
	 *
	 * @return int
	 */
	private function order_count() {
		if ( function_exists( 'wc_get_orders' ) ) {
			$ids = wc_get_orders(
				array(
					'limit'  => -1,
					'return' => 'ids',
					'status' => array_keys( wc_get_order_statuses() ),
				)
			);
			return is_array( $ids ) ? count( $ids ) : 0;
		}
		return $this->post_count( 'shop_order', array_map( static function ( $s ) {
			return str_replace( 'wc-', '', $s );
		}, array_keys( wc_get_order_statuses() ) ) );
	}

	/**
	 * Count WooCommerce customers (users with the customer role).
	 *
	 * @return int
	 */
	private function customer_count() {
		$result = count_users();
		if ( isset( $result['avail_roles']['customer'] ) ) {
			return (int) $result['avail_roles']['customer'];
		}
		return 0;
	}

	/**
	 * Count product reviews (approved + pending comments on products).
	 *
	 * @return int
	 */
	private function review_count() {
		$comments = get_comments(
			array(
				'post_type' => 'product',
				'type'      => 'review',
				'status'    => 'all',
				'count'     => true,
			)
		);
		return (int) $comments;
	}
}
