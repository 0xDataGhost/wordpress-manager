<?php
/**
 * Idempotency store for SaaS commands (Phase 25).
 *
 * Every mutating SaaS request carries an X-Saas-Idempotency-Key header. The
 * first successful execution stores its response in a dedicated table; a
 * replayed key returns the stored response WITHOUT re-applying the mutation,
 * so a SaaS retry (timeout, crash, Command Center retry) can never double-apply
 * a change. Failed executions are NOT stored — a retry re-executes them.
 *
 * Durable table (not transients) because idempotency is a correctness
 * guarantee: external object caches may evict transients at any time.
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_Idempotency {

	const HEADER_KEY = 'X-Saas-Idempotency-Key';

	/** Stored responses expire after this many days (belt-and-braces GC). */
	const TTL_DAYS = 7;

	/** Bump when the table shape changes; checked on plugins_loaded. */
	const SCHEMA_VERSION = '1';

	const SCHEMA_OPTION = 'saas_connector_idempotency_schema';

	/**
	 * Fully-prefixed table name.
	 *
	 * @return string
	 */
	private static function table() {
		global $wpdb;
		return $wpdb->prefix . 'saas_connector_idempotency';
	}

	/**
	 * Create/upgrade the table. Called on activation and (cheaply, via version
	 * option check) on plugins_loaded so upgrades that skip activation still
	 * get the table.
	 */
	public static function install() {
		if ( self::SCHEMA_VERSION === get_option( self::SCHEMA_OPTION ) ) {
			return;
		}
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$table   = self::table();
		$charset = $wpdb->get_charset_collate();
		// key_hash is sha256 hex of the raw idempotency key (bounded, indexable).
		$sql = "CREATE TABLE {$table} (
			key_hash char(64) NOT NULL,
			command_id varchar(64) NOT NULL DEFAULT '',
			status_code smallint unsigned NOT NULL DEFAULT 200,
			response longtext NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (key_hash),
			KEY created_at (created_at)
		) {$charset};";
		dbDelta( $sql );

		update_option( self::SCHEMA_OPTION, self::SCHEMA_VERSION, false );
	}

	/**
	 * Execute a REST callback under the request's idempotency key.
	 *
	 * No key header -> plain execution (reads and legacy callers unaffected).
	 * Known key      -> stored response replayed, mutation NOT re-applied.
	 * New key        -> callback runs; a successful WP_REST_Response is stored.
	 *
	 * @param WP_REST_Request $request  Incoming authenticated request.
	 * @param callable        $callback function( WP_REST_Request ): WP_REST_Response|WP_Error.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function wrap( WP_REST_Request $request, $callback ) {
		$raw_key = (string) $request->get_header( self::HEADER_KEY );
		if ( '' === $raw_key || strlen( $raw_key ) > 255 ) {
			return call_user_func( $callback, $request );
		}
		$key_hash = hash( 'sha256', $raw_key );

		$stored = self::find( $key_hash );
		if ( null !== $stored ) {
			$body = json_decode( (string) $stored['response'], true );
			if ( is_array( $body ) ) {
				$body['replayed'] = true;
				return new WP_REST_Response( $body, (int) $stored['status_code'] );
			}
			// Unreadable stored row: fall through and re-execute (safe: the row
			// only exists for previously SUCCESSFUL executions of idempotent
			// callbacks; re-running is the lesser evil vs. failing forever).
		}

		$response = call_user_func( $callback, $request );

		if ( $response instanceof WP_REST_Response ) {
			$status = (int) $response->get_status();
			if ( $status >= 200 && $status < 300 ) {
				self::store( $key_hash, $status, $response->get_data() );
			}
		}

		return $response;
	}

	/**
	 * Look up a stored response by key hash (expired rows are ignored).
	 *
	 * @param string $key_hash sha256 hex of the idempotency key.
	 * @return array{status_code:int|string,response:string}|null
	 */
	private static function find( $key_hash ) {
		global $wpdb;
		$table  = self::table();
		$cutoff = gmdate( 'Y-m-d H:i:s', time() - self::TTL_DAYS * DAY_IN_SECONDS );
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is plugin-controlled.
		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT status_code, response FROM {$table} WHERE key_hash = %s AND created_at > %s",
				$key_hash,
				$cutoff
			),
			ARRAY_A
		);
		return is_array( $row ) ? $row : null;
	}

	/**
	 * Persist a successful response and opportunistically purge expired rows.
	 *
	 * @param string $key_hash sha256 hex of the idempotency key.
	 * @param int    $status   HTTP status of the stored response.
	 * @param mixed  $data     Response body (JSON-encodable envelope).
	 */
	private static function store( $key_hash, $status, $data ) {
		global $wpdb;
		$table = self::table();

		$command_id = '';
		if ( class_exists( 'Saas_Connector_Echo' ) ) {
			$command_id = Saas_Connector_Echo::current_command_id();
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$wpdb->replace(
			$table,
			array(
				'key_hash'    => $key_hash,
				'command_id'  => substr( $command_id, 0, 64 ),
				'status_code' => $status,
				'response'    => wp_json_encode( $data ),
				'created_at'  => gmdate( 'Y-m-d H:i:s' ),
			),
			array( '%s', '%s', '%d', '%s', '%s' )
		);

		// Cheap probabilistic GC (~1% of writes) keeps the table bounded.
		if ( 0 === wp_rand( 0, 99 ) ) {
			$cutoff = gmdate( 'Y-m-d H:i:s', time() - self::TTL_DAYS * DAY_IN_SECONDS );
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is plugin-controlled.
			$wpdb->query( $wpdb->prepare( "DELETE FROM {$table} WHERE created_at <= %s", $cutoff ) );
		}
	}
}
