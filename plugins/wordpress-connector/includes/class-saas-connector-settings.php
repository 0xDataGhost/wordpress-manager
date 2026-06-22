<?php
/**
 * Persistent settings storage for the SaaS connector.
 *
 * All values live in a single wp_options row with autoload DISABLED, so the
 * API key is not pulled into memory on every page load. The API key is stored
 * as entered (WordPress has no app-level secret store); see README for the
 * documented risk and mitigations.
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_Settings {

	const OPTION_KEY = 'saas_connector_settings';

	/**
	 * Default shape of the settings array.
	 *
	 * @return array<string,string>
	 */
	private static function defaults() {
		return array(
			'api_url'      => '',
			'api_key'      => '',
			'status'       => 'disconnected',
			'store_name'   => '',
			'last_checked' => '',
			'last_synced'  => '',
		);
	}

	/**
	 * Register the option on activation with autoload = 'no'.
	 */
	public static function install() {
		if ( false === get_option( self::OPTION_KEY, false ) ) {
			add_option( self::OPTION_KEY, self::defaults(), '', 'no' );
		}
	}

	/**
	 * Get the full settings array, merged with defaults.
	 *
	 * @return array<string,string>
	 */
	public static function all() {
		$stored = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}
		return wp_parse_args( $stored, self::defaults() );
	}

	/**
	 * Get a single setting value.
	 *
	 * @param string $key     Setting name.
	 * @param string $default Fallback value.
	 * @return string
	 */
	public static function get( $key, $default = '' ) {
		$all = self::all();
		return isset( $all[ $key ] ) ? $all[ $key ] : $default;
	}

	/**
	 * Merge and persist a partial set of values.
	 *
	 * @param array<string,string> $values Values to update.
	 */
	public static function update( array $values ) {
		$merged = wp_parse_args( $values, self::all() );
		update_option( self::OPTION_KEY, $merged, 'no' );
	}

	/**
	 * Clear the stored API key and reset connection state (used on disconnect).
	 */
	public static function clear_credentials() {
		self::update(
			array(
				'api_key'      => '',
				'status'       => 'disconnected',
				'store_name'   => '',
				'last_checked' => '',
				'last_synced'  => '',
			)
		);
	}

	/**
	 * Whether the connector currently considers itself connected.
	 *
	 * @return bool
	 */
	public static function is_connected() {
		return 'connected' === self::get( 'status' )
			&& '' !== self::get( 'api_key' );
	}
}
