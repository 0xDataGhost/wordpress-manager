<?php
/**
 * Read endpoints the SaaS pulls during a manual WooCommerce sync.
 *
 * The SaaS calls these (signed with the connector API key, verified by
 * Saas_Connector_Signature::authorize_rest) to fetch products, orders and
 * customers. The connector stays thin: it only reads WooCommerce and returns
 * already-normalized, non-sensitive data in camelCase that matches the SaaS
 * sync schemas. No business logic, upserts, or webhooks live here — the SaaS
 * owns all of that.
 *
 * Each endpoint is paginated and returns:
 *   { success: true, data: { items: [...], page, totalPages }, message: "" }
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_Sync {

	/** Default page size; clamped to a safe maximum. */
	const DEFAULT_PER_PAGE = 50;
	const MAX_PER_PAGE      = 100;

	/**
	 * REST permission callback shared by every read endpoint.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return true|WP_Error
	 */
	public function authorize( WP_REST_Request $request ) {
		return Saas_Connector_Signature::authorize_rest( $request );
	}

	/**
	 * Resolve the requested page (>= 1).
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return int
	 */
	private function page( WP_REST_Request $request ) {
		return max( 1, (int) $request->get_param( 'page' ) );
	}

	/**
	 * Resolve the per-page size, clamped to [1, MAX_PER_PAGE].
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return int
	 */
	private function per_page( WP_REST_Request $request ) {
		$raw = (int) $request->get_param( 'per_page' );
		if ( $raw <= 0 ) {
			$raw = self::DEFAULT_PER_PAGE;
		}
		return min( self::MAX_PER_PAGE, $raw );
	}

	/**
	 * Build the standard paginated envelope.
	 *
	 * @param array $items       Normalized items.
	 * @param int   $page        Current page.
	 * @param int   $total_pages Total page count.
	 * @return WP_REST_Response
	 */
	private function respond( array $items, $page, $total_pages ) {
		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array(
					'items'      => $items,
					'page'       => (int) $page,
					'totalPages' => max( 1, (int) $total_pages ),
				),
				'message' => '',
			),
			200
		);
	}

	/**
	 * GET /sync/products — normalized WooCommerce products.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response
	 */
	public function get_products( WP_REST_Request $request ) {
		$page     = $this->page( $request );
		$per_page = $this->per_page( $request );

		$query = wc_get_products(
			array(
				'limit'    => $per_page,
				'page'     => $page,
				'paginate' => true,
				'status'   => array( 'publish', 'draft', 'pending', 'private' ),
				'orderby'  => 'ID',
				'order'    => 'ASC',
				'return'   => 'objects',
			)
		);

		$items = array();
		foreach ( $query->products as $product ) {
			$items[] = Saas_Connector_Normalize::product( $product );
		}

		return $this->respond( $items, $page, $query->max_num_pages );
	}

	/**
	 * GET /sync/orders — normalized WooCommerce orders with line items.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response
	 */
	public function get_orders( WP_REST_Request $request ) {
		$page     = $this->page( $request );
		$per_page = $this->per_page( $request );

		$query = wc_get_orders(
			array(
				'limit'    => $per_page,
				'page'     => $page,
				'paginate' => true,
				'orderby'  => 'ID',
				'order'    => 'ASC',
				'type'     => 'shop_order',
			)
		);

		$items = array();
		foreach ( $query->orders as $order ) {
			$items[] = Saas_Connector_Normalize::order( $order );
		}

		return $this->respond( $items, $page, $query->max_num_pages );
	}

	/**
	 * GET /sync/customers — normalized WooCommerce customers (registered users).
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response
	 */
	public function get_customers( WP_REST_Request $request ) {
		$page     = $this->page( $request );
		$per_page = $this->per_page( $request );

		$query = new WP_User_Query(
			array(
				'role'    => 'customer',
				'number'  => $per_page,
				'paged'   => $page,
				'orderby' => 'ID',
				'order'   => 'ASC',
				'fields'  => array( 'ID', 'user_email', 'display_name' ),
			)
		);

		$total       = (int) $query->get_total();
		$total_pages = $per_page > 0 ? (int) ceil( $total / $per_page ) : 1;

		$items = array();
		foreach ( $query->get_results() as $user ) {
			$items[] = Saas_Connector_Normalize::customer( $user );
		}

		return $this->respond( $items, $page, $total_pages );
	}
}
