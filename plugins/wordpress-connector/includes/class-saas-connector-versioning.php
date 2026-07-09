<?php
/**
 * Compare-and-set version checks (Phase 25).
 *
 * A SaaS command may carry X-Saas-Expected-Version — the entity version the
 * dashboard last saw (the unix timestamp of the entity's date_modified, as
 * reported in webhook/sync payloads via `entityVersion`). When the header is
 * present and does not match the CURRENT version, the mutation is rejected
 * with a 409 so the SaaS never silently overwrites a wp-admin edit. Requests
 * without the header behave exactly as before (last-write-wins).
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_Versioning {

	const HEADER_EXPECTED_VERSION = 'X-Saas-Expected-Version';

	/**
	 * Entity version token: unix timestamp of date_modified, '' when unknown.
	 *
	 * @param WC_DateTime|null $date_modified The entity's date_modified.
	 * @return string
	 */
	public static function version_of( $date_modified ) {
		if ( $date_modified instanceof WC_DateTime ) {
			return (string) $date_modified->getTimestamp();
		}
		return '';
	}

	/**
	 * Enforce the expected-version header against the entity's current version.
	 *
	 * @param WP_REST_Request  $request       Incoming request.
	 * @param WC_DateTime|null $date_modified The entity's current date_modified.
	 * @return true|WP_Error True when consistent (or unchecked), 409 WP_Error on mismatch.
	 */
	public static function check( WP_REST_Request $request, $date_modified ) {
		$expected = trim( (string) $request->get_header( self::HEADER_EXPECTED_VERSION ) );
		if ( '' === $expected ) {
			return true;
		}
		$current = self::version_of( $date_modified );
		if ( '' === $current || $expected === $current ) {
			return true;
		}
		return new WP_Error(
			'conflict',
			'The entity was modified in WordPress after the version you are editing. Refresh and try again.',
			array(
				'status'          => 409,
				'currentVersion'  => $current,
				'expectedVersion' => $expected,
			)
		);
	}
}
