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
			$items[] = $this->normalize_product( $product );
		}

		return $this->respond( $items, $page, $query->max_num_pages );
	}

	/**
	 * Normalize a WooCommerce product to the SaaS sync shape.
	 *
	 * @param WC_Product $product Product to normalize.
	 * @return array
	 */
	private function normalize_product( WC_Product $product ) {
		$price = $product->get_regular_price();
		if ( '' === $price ) {
			$price = $product->get_price();
		}

		return array(
			'wpProductId'      => $product->get_id(),
			'name'             => $product->get_name(),
			'description'      => $product->get_description(),
			'shortDescription' => $product->get_short_description(),
			'price'            => '' === $price ? '0' : (string) $price,
			'stockQuantity'    => (int) $product->get_stock_quantity(),
			'status'           => $product->get_status(),
			'images'           => $this->product_images( $product ),
		);
	}

	/**
	 * Collect a product's featured + gallery images as normalized references.
	 *
	 * @param WC_Product $product Product.
	 * @return array
	 */
	private function product_images( WC_Product $product ) {
		$ids = array();
		$featured = $product->get_image_id();
		if ( $featured ) {
			$ids[] = (int) $featured;
		}
		foreach ( (array) $product->get_gallery_image_ids() as $gid ) {
			$ids[] = (int) $gid;
		}

		$images = array();
		foreach ( array_unique( $ids ) as $id ) {
			$src = wp_get_attachment_image_url( $id, 'full' );
			if ( ! $src ) {
				continue;
			}
			$images[] = array(
				'wpImageId' => $id,
				'src'       => $src,
				'alt'       => (string) get_post_meta( $id, '_wp_attachment_image_alt', true ),
			);
		}
		return $images;
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
			$items[] = $this->normalize_order( $order );
		}

		return $this->respond( $items, $page, $query->max_num_pages );
	}

	/**
	 * Normalize a WooCommerce order to the SaaS sync shape.
	 *
	 * @param WC_Order $order Order to normalize.
	 * @return array
	 */
	private function normalize_order( WC_Order $order ) {
		$created      = $order->get_date_created();
		$customer_id  = (int) $order->get_customer_id();
		$line_items   = array();

		foreach ( $order->get_items() as $item ) {
			/** @var WC_Order_Item_Product $item */
			$quantity = (int) $item->get_quantity();
			$total    = (float) $item->get_total();
			$product  = $item->get_product();
			$sku      = $product ? $product->get_sku() : '';

			$line_items[] = array(
				'wpProductId' => (int) $item->get_product_id(),
				'name'        => $item->get_name(),
				'sku'         => $sku ? $sku : null,
				'quantity'    => $quantity,
				'price'       => $quantity > 0 ? (string) round( $total / $quantity, 2 ) : (string) $total,
				'total'       => (string) $total,
			);
		}

		return array(
			'wpOrderId'     => $order->get_id(),
			'orderNumber'   => (string) $order->get_order_number(),
			'status'        => $order->get_status(),
			'total'         => (string) $order->get_total(),
			'currency'      => $order->get_currency(),
			'paymentMethod' => $order->get_payment_method(),
			'wpCustomerId'  => $customer_id > 0 ? $customer_id : null,
			'placedAt'      => $created ? $created->date( 'c' ) : null,
			'lineItems'     => $line_items,
		);
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
			$items[] = $this->normalize_customer( $user );
		}

		return $this->respond( $items, $page, $total_pages );
	}

	/**
	 * Normalize a customer user to the SaaS sync shape.
	 *
	 * @param WP_User $user Customer user.
	 * @return array
	 */
	private function normalize_customer( $user ) {
		$id    = (int) $user->ID;
		$first = (string) get_user_meta( $id, 'first_name', true );
		$last  = (string) get_user_meta( $id, 'last_name', true );
		$name  = trim( $first . ' ' . $last );
		if ( '' === $name ) {
			$name = (string) $user->display_name;
		}

		$last_order_at = null;
		if ( function_exists( 'wc_get_customer_last_order' ) ) {
			$last_order = wc_get_customer_last_order( $id );
			if ( $last_order && $last_order->get_date_created() ) {
				$last_order_at = $last_order->get_date_created()->date( 'c' );
			}
		}

		return array(
			'wpCustomerId' => $id,
			'name'         => $name,
			'email'        => (string) $user->user_email,
			'phone'        => (string) get_user_meta( $id, 'billing_phone', true ),
			'totalSpent'   => function_exists( 'wc_get_customer_total_spent' )
				? (string) wc_get_customer_total_spent( $id )
				: '0',
			'ordersCount'  => function_exists( 'wc_get_customer_order_count' )
				? (int) wc_get_customer_order_count( $id )
				: 0,
			'lastOrderAt'  => $last_order_at,
		);
	}
}
