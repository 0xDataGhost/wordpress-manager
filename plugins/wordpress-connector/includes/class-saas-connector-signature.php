<?php
/**
 * HMAC request-signing helper.
 *
 * Phase 4 foundation for authenticating traffic between the WordPress connector
 * and the SaaS. Requests the connector sends to the SaaS already carry the API
 * key as a bearer token; the signature adds tamper-evidence and replay
 * protection (via a timestamp) and is the basis for verifying SaaS -> WordPress
 * requests in later phases.
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_Signature {

	const HEADER_SIGNATURE = 'X-Saas-Signature';
	const HEADER_TIMESTAMP = 'X-Saas-Timestamp';

	/**
	 * Maximum allowed clock skew (seconds) between the signed timestamp and now.
	 */
	const MAX_TIMESTAMP_SKEW = 300;

	/**
	 * Shared REST permission callback: authenticate an inbound SaaS request by
	 * verifying its HMAC signature against the stored connector API key, with a
	 * timestamp window to limit replay. Used by both the product write endpoints
	 * and the read endpoints the SaaS pulls during a manual sync.
	 *
	 * @param WP_REST_Request $request               Incoming request.
	 * @param bool            $require_woocommerce    Require WooCommerce active.
	 * @return true|WP_Error
	 */
	public static function authorize_rest( WP_REST_Request $request, $require_woocommerce = true ) {
		if ( $require_woocommerce && ! class_exists( 'WooCommerce' ) ) {
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

		$signature = (string) $request->get_header( self::HEADER_SIGNATURE );
		$timestamp = (string) $request->get_header( self::HEADER_TIMESTAMP );

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
		if ( ! self::verify( $signature, $timestamp, $body, $secret ) ) {
			return new WP_Error(
				'invalid_signature',
				'Request signature could not be verified.',
				array( 'status' => 401 )
			);
		}

		return true;
	}

	/**
	 * Compute a base64 HMAC-SHA256 signature over a canonical message.
	 *
	 * The signed message binds the timestamp to the body so a captured signature
	 * cannot be replayed with different content: "{timestamp}.{body}".
	 *
	 * @param string $timestamp Unix timestamp as a string.
	 * @param string $body      Raw request body.
	 * @param string $secret    Shared secret (the connector API key).
	 * @return string Base64-encoded signature.
	 */
	public static function sign( $timestamp, $body, $secret ) {
		$message = $timestamp . '.' . $body;
		return base64_encode( hash_hmac( 'sha256', $message, $secret, true ) );
	}

	/**
	 * Constant-time verification of a signature for a body/timestamp/secret.
	 *
	 * @param string $signature Provided signature (base64).
	 * @param string $timestamp Provided timestamp.
	 * @param string $body      Raw body.
	 * @param string $secret    Shared secret.
	 * @return bool
	 */
	public static function verify( $signature, $timestamp, $body, $secret ) {
		$expected = self::sign( $timestamp, $body, $secret );
		return hash_equals( $expected, (string) $signature );
	}

	/**
	 * Build the signature headers for an outgoing request body.
	 *
	 * @param string $body   Raw request body.
	 * @param string $secret Shared secret.
	 * @return array<string,string>
	 */
	public static function headers( $body, $secret ) {
		$timestamp = (string) time();
		return array(
			self::HEADER_TIMESTAMP => $timestamp,
			self::HEADER_SIGNATURE => self::sign( $timestamp, $body, $secret ),
		);
	}
}
