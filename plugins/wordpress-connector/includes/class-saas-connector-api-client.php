<?php
/**
 * HTTP client for talking to the SaaS backend.
 *
 * Sends connector-authenticated requests (Authorization: Bearer <api_key>) to
 * the SaaS connector endpoints. Keeps zero business logic — it only marshals
 * site metadata and relays responses. The SaaS API URL must point at the API
 * base, e.g. https://app.example.com/api/v1
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_Api_Client {

	/**
	 * Non-secret metadata describing this site, sent on connect.
	 *
	 * @return array<string,mixed>
	 */
	public static function site_payload() {
		$wc_version = defined( 'WC_VERSION' ) ? WC_VERSION : '';
		return array(
			'siteUrl'          => get_bloginfo( 'url' ),
			'wpVersion'        => get_bloginfo( 'version' ),
			'wcVersion'        => $wc_version,
			'connectorVersion' => SAAS_CONNECTOR_VERSION,
			// Phase 25: capability handshake — the SaaS gates write-back
			// features per store on this list.
			'capabilities'     => Saas_Connector_Capabilities::all(),
		);
	}

	/**
	 * POST to a connector endpoint with bearer + signature auth.
	 *
	 * @param string               $api_url Base API URL.
	 * @param string               $api_key Connector API key.
	 * @param string               $path    Endpoint path (e.g. "wp/connect").
	 * @param array<string,mixed>  $body    JSON body.
	 * @param int                  $timeout Request timeout in seconds.
	 * @return array{ok:bool,code:int,data:mixed,message:string}
	 */
	private static function post( $api_url, $api_key, $path, array $body, $timeout = 20 ) {
		$url = self::build_url( $api_url, $path );
		if ( '' === $url ) {
			return self::failure( 0, __( 'SaaS API URL is not configured.', 'saas-connector' ) );
		}

		$json    = wp_json_encode( $body );
		$headers = array(
			'Authorization' => 'Bearer ' . $api_key,
			'Content-Type'  => 'application/json',
			'Accept'        => 'application/json',
		);
		$headers = array_merge(
			$headers,
			Saas_Connector_Signature::headers( $json, $api_key )
		);

		$response = wp_remote_post(
			$url,
			array(
				'timeout' => (int) $timeout,
				'headers' => $headers,
				'body'    => $json,
			)
		);

		if ( is_wp_error( $response ) ) {
			return self::failure( 0, $response->get_error_message() );
		}

		$code   = (int) wp_remote_retrieve_response_code( $response );
		$parsed = json_decode( wp_remote_retrieve_body( $response ), true );
		$ok     = ( $code >= 200 && $code < 300 )
			&& is_array( $parsed )
			&& ! empty( $parsed['success'] );

		if ( $ok ) {
			return array(
				'ok'      => true,
				'code'    => $code,
				'data'    => isset( $parsed['data'] ) ? $parsed['data'] : array(),
				'message' => isset( $parsed['message'] ) ? (string) $parsed['message'] : '',
			);
		}

		$message = __( 'Request failed.', 'saas-connector' );
		if ( is_array( $parsed ) && isset( $parsed['error']['message'] ) ) {
			$message = (string) $parsed['error']['message'];
		}
		return self::failure( $code, $message );
	}

	/**
	 * Connect this store: send site metadata to /wp/connect.
	 *
	 * @param string $api_url Base API URL.
	 * @param string $api_key Connector API key.
	 * @return array{ok:bool,code:int,data:mixed,message:string}
	 */
	public static function connect( $api_url, $api_key ) {
		return self::post( $api_url, $api_key, 'wp/connect', self::site_payload() );
	}

	/**
	 * Verify credentials / run a health check against /wp/verify.
	 *
	 * @param string $api_url Base API URL.
	 * @param string $api_key Connector API key.
	 * @return array{ok:bool,code:int,data:mixed,message:string}
	 */
	public static function verify( $api_url, $api_key ) {
		return self::post( $api_url, $api_key, 'wp/verify', array() );
	}

	/**
	 * Disconnect this store via /wp/disconnect.
	 *
	 * @param string $api_url Base API URL.
	 * @param string $api_key Connector API key.
	 * @return array{ok:bool,code:int,data:mixed,message:string}
	 */
	public static function disconnect( $api_url, $api_key ) {
		return self::post( $api_url, $api_key, 'wp/disconnect', array() );
	}

	/**
	 * Trigger a manual sync on the SaaS via /wp/sync. The SaaS then pulls the
	 * requested data back from this site's read endpoints — the connector only
	 * asks for the sync, keeping all business logic on the SaaS side.
	 *
	 * @param string $api_url Base API URL.
	 * @param string $api_key Connector API key.
	 * @param string $entity  One of product|order|customer|all.
	 * @return array{ok:bool,code:int,data:mixed,message:string}
	 */
	public static function sync( $api_url, $api_key, $entity = 'all' ) {
		return self::post( $api_url, $api_key, 'wp/sync', array( 'entity' => $entity ) );
	}

	/**
	 * Deliver a real-time webhook to the SaaS (Phase 13 incremental sync).
	 *
	 * POSTs a normalized event envelope to wp/webhooks/{entity}. Uses a shorter
	 * timeout than connect/sync so a WooCommerce save is never blocked for long,
	 * and returns the result so the caller can log a delivery failure. The SaaS
	 * authenticates via the bearer API key and dedupes on the envelope's eventId.
	 *
	 * @param string              $api_url Base API URL.
	 * @param string              $api_key Connector API key.
	 * @param string              $entity  One of products|orders|customers.
	 * @param array<string,mixed> $payload Normalized event envelope.
	 * @return array{ok:bool,code:int,data:mixed,message:string}
	 */
	public static function send_webhook( $api_url, $api_key, $entity, array $payload ) {
		return self::post( $api_url, $api_key, 'wp/webhooks/' . $entity, $payload, 10 );
	}

	/**
	 * Join the configured base URL and an endpoint path safely.
	 *
	 * @param string $api_url Base API URL.
	 * @param string $path    Endpoint path.
	 * @return string Empty string when the base URL is invalid.
	 */
	private static function build_url( $api_url, $path ) {
		$api_url = trim( (string) $api_url );
		if ( '' === $api_url || ! wp_http_validate_url( $api_url ) ) {
			return '';
		}
		return trailingslashit( $api_url ) . ltrim( $path, '/' );
	}

	/**
	 * Shape a failure result.
	 *
	 * @param int    $code    HTTP status (0 for transport errors).
	 * @param string $message Human-readable message.
	 * @return array{ok:bool,code:int,data:mixed,message:string}
	 */
	private static function failure( $code, $message ) {
		return array(
			'ok'      => false,
			'code'    => $code,
			'data'    => array(),
			'message' => $message,
		);
	}
}
