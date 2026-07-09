<?php
/**
 * Connector capability handshake (Phase 25).
 *
 * The connector reports which SaaS-facing operations this installed version
 * supports. The SaaS stores the list on the store's connection and gates each
 * dashboard write-back feature on it, so an outdated plugin degrades to an
 * "update the connector" notice instead of failing requests (plan3 §2.4).
 *
 * A capability slug is added here in the SAME change that ships its endpoint.
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_Capabilities {

	/**
	 * Capability slugs supported by this plugin version.
	 *
	 * @return string[]
	 */
	public static function all() {
		return array(
			// Infrastructure (Phase 25).
			'capabilities',
			'idempotency',
			'echo.origin_command',
			'versioning.expected_version',
			// Write surface.
			'product.create',
			'product.update',
			'order.add_digital_note',
			// Phase 27 — order management.
			'order.update_status',
			'order.add_note',
			'order.list_notes',
			'order.create_refund',
			'order.list_refunds',
			// Phase 26 — catalog control.
			'product.delete',
			'product.bulk_update',
			'product.variations',
			'taxonomy.categories',
			'taxonomy.tags',
			'taxonomy.attributes',
			'media.sideload',
			'sync.taxonomies',
			// Phase 28 — coupons.
			'coupon.create',
			'coupon.update',
			'coupon.delete',
			'sync.coupons',
			'webhook.coupon.created',
			'webhook.coupon.updated',
			'webhook.coupon.deleted',
			// Phase 29 — customers & reviews.
			'customer.update',
			'review.list',
			'review.moderate',
			'review.reply',
			'sync.reviews',
			// Phase 30 — store configuration.
			'settings.general',
			'settings.products',
			'settings.tax',
			'shipping.zones',
			'shipping.methods',
			'taxes.rates',
			'gateways.list',
			'gateways.toggle',
			// Phase 31 — parity & reconciliation.
			'counts',
			'webhook.review.created',
			'webhook.review.updated',
			'webhook.coupon.deleted',
			// Read/sync surface.
			'sync.products',
			'sync.orders',
			'sync.customers',
			// Webhook topics this version emits.
			'webhook.product.updated',
			'webhook.order.created',
			'webhook.order.updated',
			'webhook.customer.created',
			'webhook.customer.updated',
		);
	}

	/**
	 * REST permission callback — verifies the SaaS HMAC signature. WooCommerce
	 * is NOT required: the handshake must work even when WooCommerce is off so
	 * the SaaS can explain the site's state.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return true|WP_Error
	 */
	public function authorize( WP_REST_Request $request ) {
		return Saas_Connector_Signature::authorize_rest( $request, false );
	}

	/**
	 * GET /capabilities — version + capability slugs (non-sensitive).
	 *
	 * @return WP_REST_Response
	 */
	public function get_capabilities() {
		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array(
					'connectorVersion'   => SAAS_CONNECTOR_VERSION,
					'capabilities'       => self::all(),
					'woocommerceActive'  => class_exists( 'WooCommerce' ),
				),
				'message' => '',
			),
			200
		);
	}
}
