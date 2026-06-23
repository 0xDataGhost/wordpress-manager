<?php
/**
 * Shared WooCommerce -> SaaS normalization.
 *
 * Converts WooCommerce/WordPress objects into the camelCase shape the SaaS sync
 * and webhook schemas expect. Used by both the read endpoints the SaaS pulls
 * during a manual sync (Saas_Connector_Sync) and the real-time webhook sender
 * (Saas_Connector_Webhooks), so the wire shape stays identical on both paths and
 * the SaaS reuses one idempotent upsert. Pure data shaping only — no business
 * logic, no persistence, no secrets.
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_Normalize {

	/**
	 * Normalize a WooCommerce product to the SaaS sync/webhook shape.
	 *
	 * @param WC_Product $product Product to normalize.
	 * @return array<string,mixed>
	 */
	public static function product( WC_Product $product ) {
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
			'images'           => self::product_images( $product ),
		);
	}

	/**
	 * Collect a product's featured + gallery images as normalized references.
	 *
	 * @param WC_Product $product Product.
	 * @return array<int,array<string,mixed>>
	 */
	public static function product_images( WC_Product $product ) {
		$ids      = array();
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
	 * Normalize a WooCommerce order (with line items) to the SaaS shape.
	 *
	 * @param WC_Order $order Order to normalize.
	 * @return array<string,mixed>
	 */
	public static function order( WC_Order $order ) {
		$created     = $order->get_date_created();
		$customer_id = (int) $order->get_customer_id();
		$line_items  = array();

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
	 * Normalize a customer user to the SaaS shape.
	 *
	 * Accepts any object exposing ID / user_email / display_name — both the
	 * limited WP_User_Query result used by the sync endpoint and a full WP_User
	 * from get_userdata() used by the webhook sender.
	 *
	 * @param WP_User|object $user Customer user.
	 * @return array<string,mixed>
	 */
	public static function customer( $user ) {
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
