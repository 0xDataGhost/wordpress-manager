<?php
/**
 * Echo suppression for SaaS-originated changes (Phase 25).
 *
 * When the SaaS mutates this site it sends an X-Saas-Command-Id header. The
 * connector adopts that id for the lifetime of the request; every webhook the
 * mutation fires (product/order/customer hooks run synchronously inside the
 * same request) is stamped with it as `originCommandId`, letting the SaaS
 * confirm its own command instead of re-processing the change as external.
 *
 * The scope is deliberately per-request: the connector processes exactly one
 * SaaS command per HTTP request, so "adopted command id" and "cause of every
 * hook in this request" are the same thing — no entity bookkeeping needed.
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_Echo {

	const HEADER_COMMAND_ID = 'X-Saas-Command-Id';

	/**
	 * Command id adopted from the current request, or '' when the request did
	 * not originate from the SaaS.
	 *
	 * @var string
	 */
	private static $current_command_id = '';

	/**
	 * Adopt the command id from an authenticated SaaS request. Called from the
	 * shared signature authorizer AFTER the HMAC verified — the header is never
	 * trusted on unauthenticated requests. The value is validated as a UUID so
	 * only well-formed ids ever travel back on webhooks.
	 *
	 * @param WP_REST_Request $request Authenticated request.
	 */
	public static function adopt_from_request( WP_REST_Request $request ) {
		$raw = (string) $request->get_header( self::HEADER_COMMAND_ID );
		if ( '' === $raw ) {
			return;
		}
		if ( ! preg_match( '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $raw ) ) {
			return;
		}
		self::$current_command_id = strtolower( $raw );
	}

	/**
	 * The command id that caused the current request, or '' for organic changes.
	 *
	 * @return string
	 */
	public static function current_command_id() {
		return self::$current_command_id;
	}
}
