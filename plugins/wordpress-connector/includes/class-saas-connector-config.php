<?php
/**
 * Store configuration endpoints called by the SaaS (Phase 30, plan3).
 *
 * Settings groups, shipping zones/methods, tax rates and payment-gateway
 * enable/disable. The strictest connector class:
 *  - reads/writes are field-allowlisted per group;
 *  - gateway responses NEVER include secret fields — get_gateways() is built
 *    from an explicit SAFE-field allowlist (id/title/description/enabled/
 *    method/supportsRefunds) and never reads gateway settings, so no secret
 *    can be emitted; gateway writes accept only enabled/title/description
 *    (plan3 §2.3);
 *  - the base-currency option is written with the fares-store
 *    pre_option_woocommerce_currency filter removed so the write is not a
 *    no-op (documented gotcha).
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_Config {

	/** Per-group readable/writable option allowlists (mirror of the SaaS side). */
	private static $settings_allowlist = array(
		'general'  => array(
			'woocommerce_store_address',
			'woocommerce_store_address_2',
			'woocommerce_store_city',
			'woocommerce_store_postcode',
			'woocommerce_default_country',
			'woocommerce_currency',
			'woocommerce_price_thousand_sep',
			'woocommerce_price_decimal_sep',
			'woocommerce_price_num_decimals',
			'woocommerce_currency_pos',
		),
		'products' => array(
			'woocommerce_weight_unit',
			'woocommerce_dimension_unit',
			'woocommerce_enable_reviews',
			'woocommerce_manage_stock',
			'woocommerce_notify_low_stock_amount',
			'woocommerce_hide_out_of_stock_items',
		),
		'tax'      => array(
			'woocommerce_calc_taxes',
			'woocommerce_prices_include_tax',
			'woocommerce_tax_based_on',
			'woocommerce_tax_display_shop',
			'woocommerce_tax_display_cart',
		),
	);

	/**
	 * REST permission callback — verifies the SaaS HMAC signature.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return true|WP_Error
	 */
	public function authorize( WP_REST_Request $request ) {
		return Saas_Connector_Signature::authorize_rest( $request );
	}

	/* ------------------------------ Settings ------------------------------ */

	/**
	 * GET /settings/{group} — read allowlisted option values.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_settings( WP_REST_Request $request ) {
		$group = sanitize_key( (string) $request['group'] );
		if ( ! isset( self::$settings_allowlist[ $group ] ) ) {
			return new WP_Error( 'invalid_group', 'Unknown settings group.', array( 'status' => 400 ) );
		}
		$values = array();
		foreach ( self::$settings_allowlist[ $group ] as $key ) {
			$values[ $key ] = get_option( $key );
		}
		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array( 'group' => $group, 'values' => $values ),
				'message' => '',
			),
			200
		);
	}

	/**
	 * PUT /settings/{group} — write allowlisted option values.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_settings( WP_REST_Request $request ) {
		$group = sanitize_key( (string) $request['group'] );
		if ( ! isset( self::$settings_allowlist[ $group ] ) ) {
			return new WP_Error( 'invalid_group', 'Unknown settings group.', array( 'status' => 400 ) );
		}
		$params = $request->get_json_params();
		$params = is_array( $params ) ? $params : array();
		$values = isset( $params['values'] ) && is_array( $params['values'] ) ? $params['values'] : array();

		$allow = self::$settings_allowlist[ $group ];
		foreach ( $values as $key => $value ) {
			if ( ! in_array( $key, $allow, true ) ) {
				return new WP_Error(
					'field_not_allowed',
					sprintf( 'Setting "%s" is not editable.', sanitize_key( (string) $key ) ),
					array( 'status' => 400 )
				);
			}
			$this->write_option( $key, $value );
		}

		// Return the fresh values.
		$fresh = array();
		foreach ( $allow as $key ) {
			$fresh[ $key ] = get_option( $key );
		}
		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array( 'group' => $group, 'values' => $fresh ),
				'message' => 'Settings updated',
			),
			200
		);
	}

	/**
	 * Write a single option, sanitizing scalars. The currency option needs the
	 * fares-store pre_option filter removed or the write reads back filtered
	 * (documented gotcha) — we write via update_option after removing any
	 * pre_option_woocommerce_currency filters for the duration of the write.
	 *
	 * @param string $key   Option name.
	 * @param mixed  $value Option value.
	 */
	private function write_option( $key, $value ) {
		if ( is_bool( $value ) ) {
			$clean = $value ? 'yes' : 'no';
		} elseif ( is_scalar( $value ) ) {
			$clean = sanitize_text_field( (string) $value );
		} else {
			return;
		}

		if ( 'woocommerce_currency' === $key ) {
			// Neutralize the pre_option filter so the update is not a no-op.
			global $wp_filter;
			$hook    = 'pre_option_woocommerce_currency';
			$stashed = isset( $wp_filter[ $hook ] ) ? $wp_filter[ $hook ] : null;
			if ( null !== $stashed ) {
				unset( $wp_filter[ $hook ] );
			}
			update_option( $key, $clean );
			if ( null !== $stashed ) {
				$wp_filter[ $hook ] = $stashed;
			}
			return;
		}

		update_option( $key, $clean );
	}

	/* ------------------------------ Shipping ------------------------------ */

	/**
	 * GET /shipping/zones — zones with locations and methods.
	 *
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_shipping_zones() {
		if ( ! class_exists( 'WC_Shipping_Zones' ) ) {
			return new WP_Error( 'unavailable', 'Shipping is unavailable.', array( 'status' => 503 ) );
		}
		$zones   = WC_Shipping_Zones::get_zones();
		$out      = array();
		// "Rest of the world" zone (id 0) is not in get_zones().
		$rest     = new WC_Shipping_Zone( 0 );
		$out[]    = $this->zone_data( $rest );
		foreach ( $zones as $zone ) {
			$out[] = $this->zone_data( new WC_Shipping_Zone( (int) $zone['zone_id'] ) );
		}
		return new WP_REST_Response(
			array( 'success' => true, 'data' => array( 'zones' => $out ), 'message' => '' ),
			200
		);
	}

	/**
	 * Normalized shipping zone data.
	 *
	 * @param WC_Shipping_Zone $zone Zone.
	 * @return array<string,mixed>
	 */
	private function zone_data( WC_Shipping_Zone $zone ) {
		$methods = array();
		foreach ( $zone->get_shipping_methods() as $method ) {
			$methods[] = array(
				'instanceId' => (int) $method->get_instance_id(),
				'methodId'   => $method->id,
				'title'      => $method->get_title(),
				'enabled'    => 'yes' === $method->enabled,
			);
		}
		$locations = array();
		foreach ( $zone->get_zone_locations() as $loc ) {
			$locations[] = array( 'code' => $loc->code, 'type' => $loc->type );
		}
		return array(
			'zoneId'    => (int) $zone->get_id(),
			'name'      => $zone->get_zone_name(),
			'order'     => (int) $zone->get_zone_order(),
			'locations' => $locations,
			'methods'   => $methods,
		);
	}

	/**
	 * POST /shipping/zones — create a zone.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function create_zone( WP_REST_Request $request ) {
		$params = $request->get_json_params();
		$params = is_array( $params ) ? $params : array();
		$zone   = new WC_Shipping_Zone();
		$zone->set_zone_name( sanitize_text_field( (string) ( $params['name'] ?? '' ) ) );
		if ( isset( $params['order'] ) ) {
			$zone->set_zone_order( (int) $params['order'] );
		}
		$this->apply_locations( $zone, $params );
		$zone->save();
		return new WP_REST_Response(
			array( 'success' => true, 'data' => $this->zone_data( $zone ), 'message' => 'Zone created' ),
			201
		);
	}

	/**
	 * PUT /shipping/zones/{zoneId} — update a zone.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_zone( WP_REST_Request $request ) {
		$zone_id = absint( $request['zoneId'] );
		$zone    = new WC_Shipping_Zone( $zone_id );
		$params  = $request->get_json_params();
		$params  = is_array( $params ) ? $params : array();
		if ( isset( $params['name'] ) ) {
			$zone->set_zone_name( sanitize_text_field( (string) $params['name'] ) );
		}
		if ( isset( $params['order'] ) ) {
			$zone->set_zone_order( (int) $params['order'] );
		}
		if ( isset( $params['locations'] ) ) {
			$this->apply_locations( $zone, $params );
		}
		$zone->save();
		return new WP_REST_Response(
			array( 'success' => true, 'data' => $this->zone_data( $zone ), 'message' => 'Zone updated' ),
			200
		);
	}

	/**
	 * DELETE /shipping/zones/{zoneId} — delete a zone.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response
	 */
	public function delete_zone( WP_REST_Request $request ) {
		$zone_id = absint( $request['zoneId'] );
		$zone    = new WC_Shipping_Zone( $zone_id );
		$zone->delete();
		return new WP_REST_Response(
			array( 'success' => true, 'data' => array( 'zoneId' => $zone_id, 'deleted' => true ), 'message' => 'Zone deleted' ),
			200
		);
	}

	/**
	 * Apply zone locations from the request.
	 *
	 * @param WC_Shipping_Zone    $zone   Zone.
	 * @param array<string,mixed> $params Params.
	 */
	private function apply_locations( WC_Shipping_Zone $zone, array $params ) {
		if ( ! isset( $params['locations'] ) || ! is_array( $params['locations'] ) ) {
			return;
		}
		$zone->clear_locations();
		foreach ( $params['locations'] as $loc ) {
			if ( isset( $loc['code'], $loc['type'] ) ) {
				$zone->add_location( sanitize_text_field( (string) $loc['code'] ), sanitize_key( (string) $loc['type'] ) );
			}
		}
	}

	/**
	 * POST /shipping/zones/{zoneId}/methods — add/update a method.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function save_method( WP_REST_Request $request ) {
		$zone_id = absint( $request['zoneId'] );
		$zone    = new WC_Shipping_Zone( $zone_id );
		$params  = $request->get_json_params();
		$params  = is_array( $params ) ? $params : array();
		$method  = sanitize_key( (string) ( $params['methodId'] ?? '' ) );
		$allowed = array( 'flat_rate', 'free_shipping', 'local_pickup' );
		if ( ! in_array( $method, $allowed, true ) ) {
			return new WP_Error( 'invalid_method', 'Unsupported shipping method.', array( 'status' => 400 ) );
		}

		$instance_id = isset( $params['instanceId'] ) ? absint( $params['instanceId'] ) : 0;
		if ( ! $instance_id ) {
			$instance_id = $zone->add_shipping_method( $method );
		}

		// Persist per-method settings via the instance option.
		if ( isset( $params['settings'] ) && is_array( $params['settings'] ) && $instance_id ) {
			$option_key = 'woocommerce_' . $method . '_' . $instance_id . '_settings';
			$existing   = get_option( $option_key, array() );
			$existing   = is_array( $existing ) ? $existing : array();
			foreach ( $params['settings'] as $k => $v ) {
				$existing[ sanitize_key( (string) $k ) ] = is_scalar( $v ) ? sanitize_text_field( (string) $v ) : '';
			}
			if ( isset( $params['title'] ) ) {
				$existing['title'] = sanitize_text_field( (string) $params['title'] );
			}
			update_option( $option_key, $existing );
		}
		$zone->save();

		return new WP_REST_Response(
			array( 'success' => true, 'data' => $this->zone_data( new WC_Shipping_Zone( $zone_id ) ), 'message' => 'Method saved' ),
			200
		);
	}

	/**
	 * DELETE /shipping/zones/{zoneId}/methods/{methodId} — remove a method.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response
	 */
	public function delete_method( WP_REST_Request $request ) {
		$zone_id     = absint( $request['zoneId'] );
		$instance_id = absint( $request['methodId'] );
		$zone        = new WC_Shipping_Zone( $zone_id );
		$zone->delete_shipping_method( $instance_id );
		return new WP_REST_Response(
			array( 'success' => true, 'data' => $this->zone_data( new WC_Shipping_Zone( $zone_id ) ), 'message' => 'Method deleted' ),
			200
		);
	}

	/* -------------------------------- Taxes ------------------------------- */

	/**
	 * GET /taxes/rates — standard/reduced/zero rates.
	 *
	 * @return WP_REST_Response
	 */
	public function get_tax_rates() {
		$classes = array( '', 'reduced-rate', 'zero-rate' );
		$rates   = array();
		foreach ( $classes as $class ) {
			foreach ( WC_Tax::get_rates_for_tax_class( $class ) as $rate ) {
				$rates[] = array(
					'rateId'   => (int) $rate->tax_rate_id,
					'country'  => $rate->tax_rate_country,
					'state'    => $rate->tax_rate_state,
					'rate'     => $rate->tax_rate,
					'name'     => $rate->tax_rate_name,
					'priority' => (int) $rate->tax_rate_priority,
					'compound' => (bool) $rate->tax_rate_compound,
					'shipping' => (bool) $rate->tax_rate_shipping,
					'taxClass' => '' === $class ? 'standard' : $class,
				);
			}
		}
		return new WP_REST_Response(
			array( 'success' => true, 'data' => array( 'rates' => $rates ), 'message' => '' ),
			200
		);
	}

	/**
	 * POST /taxes/rates — create a rate.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response
	 */
	public function create_tax_rate( WP_REST_Request $request ) {
		$params  = $request->get_json_params();
		$params  = is_array( $params ) ? $params : array();
		$rate_id = WC_Tax::_insert_tax_rate( $this->tax_rate_args( $params ) );
		return new WP_REST_Response(
			array( 'success' => true, 'data' => array( 'rateId' => (int) $rate_id ), 'message' => 'Tax rate created' ),
			201
		);
	}

	/**
	 * PUT /taxes/rates/{rateId} — update a rate.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response
	 */
	public function update_tax_rate( WP_REST_Request $request ) {
		$rate_id = absint( $request['rateId'] );
		$params  = $request->get_json_params();
		$params  = is_array( $params ) ? $params : array();
		WC_Tax::_update_tax_rate( $rate_id, $this->tax_rate_args( $params ) );
		return new WP_REST_Response(
			array( 'success' => true, 'data' => array( 'rateId' => $rate_id ), 'message' => 'Tax rate updated' ),
			200
		);
	}

	/**
	 * DELETE /taxes/rates/{rateId} — delete a rate.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response
	 */
	public function delete_tax_rate( WP_REST_Request $request ) {
		$rate_id = absint( $request['rateId'] );
		WC_Tax::_delete_tax_rate( $rate_id );
		return new WP_REST_Response(
			array( 'success' => true, 'data' => array( 'rateId' => $rate_id, 'deleted' => true ), 'message' => 'Tax rate deleted' ),
			200
		);
	}

	/**
	 * Build WC_Tax rate args from an incoming payload.
	 *
	 * @param array<string,mixed> $params Params.
	 * @return array<string,mixed>
	 */
	private function tax_rate_args( array $params ) {
		$class = isset( $params['taxClass'] ) ? sanitize_text_field( (string) $params['taxClass'] ) : 'standard';
		return array(
			'tax_rate_country'  => isset( $params['country'] ) ? sanitize_text_field( (string) $params['country'] ) : '',
			'tax_rate_state'    => isset( $params['state'] ) ? sanitize_text_field( (string) $params['state'] ) : '',
			'tax_rate'          => isset( $params['rate'] ) ? (string) wc_format_decimal( (string) $params['rate'] ) : '0',
			'tax_rate_name'     => isset( $params['name'] ) ? sanitize_text_field( (string) $params['name'] ) : '',
			'tax_rate_priority' => isset( $params['priority'] ) ? absint( $params['priority'] ) : 1,
			'tax_rate_compound' => ! empty( $params['compound'] ) ? 1 : 0,
			'tax_rate_shipping' => isset( $params['shipping'] ) ? ( $params['shipping'] ? 1 : 0 ) : 1,
			'tax_rate_class'    => 'standard' === $class ? '' : $class,
		);
	}

	/* ------------------------------ Gateways ------------------------------ */

	/**
	 * GET /gateways — list gateways with ONLY id/title/description/enabled.
	 * Secret fields are never read or returned (plan3 §2.3).
	 *
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_gateways() {
		if ( ! function_exists( 'WC' ) || ! WC()->payment_gateways() ) {
			return new WP_Error( 'unavailable', 'Payment gateways unavailable.', array( 'status' => 503 ) );
		}
		$gateways = WC()->payment_gateways()->payment_gateways();
		$out      = array();
		foreach ( $gateways as $gateway ) {
			$out[] = array(
				'gatewayId'   => $gateway->id,
				'title'       => $gateway->get_title(),
				'description' => $gateway->get_description(),
				'enabled'     => 'yes' === $gateway->enabled,
				'method'      => $gateway->get_method_title(),
				'supportsRefunds' => $gateway->supports( 'refunds' ),
			);
		}
		return new WP_REST_Response(
			array( 'success' => true, 'data' => array( 'gateways' => $out ), 'message' => '' ),
			200
		);
	}

	/**
	 * PUT /gateways/{gatewayId} — toggle enabled + safe display fields only.
	 * NEVER writes secret credential fields.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_gateway( WP_REST_Request $request ) {
		$gateway_id = sanitize_key( (string) $request['gatewayId'] );
		if ( ! function_exists( 'WC' ) || ! WC()->payment_gateways() ) {
			return new WP_Error( 'unavailable', 'Payment gateways unavailable.', array( 'status' => 503 ) );
		}
		$gateways = WC()->payment_gateways()->payment_gateways();
		if ( ! isset( $gateways[ $gateway_id ] ) ) {
			return new WP_Error( 'not_found', 'Gateway not found.', array( 'status' => 404 ) );
		}
		$gateway = $gateways[ $gateway_id ];

		$params      = $request->get_json_params();
		$params      = is_array( $params ) ? $params : array();
		$option_key  = 'woocommerce_' . $gateway_id . '_settings';
		$settings    = get_option( $option_key, array() );
		$settings    = is_array( $settings ) ? $settings : array();

		if ( array_key_exists( 'enabled', $params ) ) {
			$settings['enabled'] = ! empty( $params['enabled'] ) ? 'yes' : 'no';
		}
		// Only the two SAFE display fields may be written from the SaaS.
		if ( isset( $params['title'] ) ) {
			$settings['title'] = sanitize_text_field( (string) $params['title'] );
		}
		if ( isset( $params['description'] ) ) {
			$settings['description'] = sanitize_textarea_field( (string) $params['description'] );
		}
		update_option( $option_key, $settings );

		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array(
					'gatewayId'   => $gateway_id,
					'title'       => isset( $settings['title'] ) ? $settings['title'] : $gateway->get_title(),
					'description' => isset( $settings['description'] ) ? $settings['description'] : $gateway->get_description(),
					'enabled'     => isset( $settings['enabled'] ) && 'yes' === $settings['enabled'],
				),
				'message' => 'Gateway updated',
			),
			200
		);
	}
}
