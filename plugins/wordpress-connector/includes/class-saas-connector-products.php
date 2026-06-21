<?php
/**
 * Product write endpoints called by the SaaS.
 *
 * Phase 5 foundation: lets the SaaS create and update WooCommerce products on
 * this site. Every request is authenticated with the connector's HMAC signature
 * (see Saas_Connector_Signature) using the stored API key as the shared secret,
 * with a timestamp window to limit replay. Responses carry only non-sensitive
 * product data — never the API key or settings.
 *
 * Scope is deliberately limited to product create/update. Orders, customers,
 * webhooks, and shipping are out of scope for this phase.
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_Products {

	/**
	 * Maximum allowed clock skew (seconds) between the signed timestamp and now.
	 */
	const MAX_TIMESTAMP_SKEW = 300;

	/**
	 * WooCommerce product statuses the SaaS may set.
	 *
	 * @var string[]
	 */
	private static $allowed_statuses = array( 'publish', 'draft', 'private', 'pending' );

	/**
	 * REST permission callback: verify the SaaS HMAC signature.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return true|WP_Error True when authorized, WP_Error otherwise.
	 */
	public function authorize( WP_REST_Request $request ) {
		if ( ! class_exists( 'WooCommerce' ) ) {
			return new WP_Error(
				'woocommerce_inactive',
				'WooCommerce is not active on this site.',
				array( 'status' => 503 )
			);
		}

		$secret = Saas_Connector_Settings::get( 'api_key' );
		if ( '' === $secret ) {
			return new WP_Error(
				'not_configured',
				'Connector is not configured with an API key.',
				array( 'status' => 401 )
			);
		}

		$signature = (string) $request->get_header( Saas_Connector_Signature::HEADER_SIGNATURE );
		$timestamp = (string) $request->get_header( Saas_Connector_Signature::HEADER_TIMESTAMP );

		if ( '' === $signature || '' === $timestamp ) {
			return new WP_Error(
				'missing_signature',
				'Missing request signature headers.',
				array( 'status' => 401 )
			);
		}

		// Reject stale or future timestamps to limit replay.
		if ( abs( time() - (int) $timestamp ) > self::MAX_TIMESTAMP_SKEW ) {
			return new WP_Error(
				'stale_signature',
				'Request signature has expired.',
				array( 'status' => 401 )
			);
		}

		$body = $request->get_body();
		if ( ! Saas_Connector_Signature::verify( $signature, $timestamp, $body, $secret ) ) {
			return new WP_Error(
				'invalid_signature',
				'Request signature could not be verified.',
				array( 'status' => 401 )
			);
		}

		return true;
	}

	/**
	 * POST /products — create a WooCommerce product from the SaaS payload.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function create_product( WP_REST_Request $request ) {
		$name = sanitize_text_field( (string) $request->get_param( 'name' ) );
		if ( '' === $name ) {
			return new WP_Error(
				'invalid_name',
				'Product name is required.',
				array( 'status' => 400 )
			);
		}

		$product = new WC_Product_Simple();
		$product->set_name( $name );
		$this->apply_payload( $product, $request );

		$product_id = $product->save();
		if ( ! $product_id ) {
			return new WP_Error(
				'create_failed',
				'Failed to create the product.',
				array( 'status' => 500 )
			);
		}

		return $this->respond( $product, 'Product created', 201 );
	}

	/**
	 * PUT /products/{id} — update an existing WooCommerce product.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_product( WP_REST_Request $request ) {
		$product_id = absint( $request->get_param( 'id' ) );
		$product    = $product_id ? wc_get_product( $product_id ) : false;

		if ( ! $product || ! $product->is_type( 'simple' ) ) {
			return new WP_Error(
				'not_found',
				'Product not found.',
				array( 'status' => 404 )
			);
		}

		$name = $request->get_param( 'name' );
		if ( null !== $name ) {
			$clean = sanitize_text_field( (string) $name );
			if ( '' === $clean ) {
				return new WP_Error(
					'invalid_name',
					'Product name cannot be empty.',
					array( 'status' => 400 )
				);
			}
			$product->set_name( $clean );
		}

		$this->apply_payload( $product, $request );
		$product->save();

		return $this->respond( $product, 'Product updated', 200 );
	}

	/**
	 * Apply the optional product fields from the request onto a product.
	 *
	 * Only fields actually present in the request are written, so updates are
	 * partial and creates fall back to WooCommerce defaults.
	 *
	 * @param WC_Product      $product Product to mutate.
	 * @param WP_REST_Request $request Incoming request.
	 */
	private function apply_payload( WC_Product $product, WP_REST_Request $request ) {
		$description = $request->get_param( 'description' );
		if ( null !== $description ) {
			$product->set_description( wp_kses_post( (string) $description ) );
		}

		$short = $request->get_param( 'short_description' );
		if ( null !== $short ) {
			$product->set_short_description( wp_kses_post( (string) $short ) );
		}

		$price = $request->get_param( 'regular_price' );
		if ( null !== $price ) {
			$product->set_regular_price( wc_format_decimal( (string) $price ) );
		}

		$status = $request->get_param( 'status' );
		if ( null !== $status ) {
			$clean = sanitize_text_field( (string) $status );
			if ( in_array( $clean, self::$allowed_statuses, true ) ) {
				$product->set_status( $clean );
			}
		}

		$manage_stock = $request->get_param( 'manage_stock' );
		if ( null !== $manage_stock ) {
			$product->set_manage_stock( rest_sanitize_boolean( $manage_stock ) );
		}

		$stock = $request->get_param( 'stock_quantity' );
		if ( null !== $stock ) {
			$product->set_stock_quantity( max( 0, (int) $stock ) );
		}

		// Image import (media sideload) is deferred to a later phase; keep the
		// source URL as reference meta so nothing is lost in the meantime.
		$images = $request->get_param( 'images' );
		if ( is_array( $images ) && isset( $images[0]['src'] ) ) {
			$src = esc_url_raw( (string) $images[0]['src'] );
			if ( '' !== $src ) {
				$product->update_meta_data( '_saas_external_image_url', $src );
			}
		}
	}

	/**
	 * Build a non-sensitive success response for a saved product.
	 *
	 * @param WC_Product $product Saved product.
	 * @param string     $message Human-readable message.
	 * @param int        $status  HTTP status code.
	 * @return WP_REST_Response
	 */
	private function respond( WC_Product $product, $message, $status ) {
		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array(
					'wpProductId'   => $product->get_id(),
					'name'          => $product->get_name(),
					'status'        => $product->get_status(),
					'regularPrice'  => $product->get_regular_price(),
					'stockQuantity' => $product->get_stock_quantity(),
					'permalink'     => get_permalink( $product->get_id() ),
				),
				'message' => $message,
			),
			$status
		);
	}
}
