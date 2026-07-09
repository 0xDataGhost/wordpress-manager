<?php
/**
 * Order write endpoints called by the SaaS (Phase 27, plan3).
 *
 * Status transitions, order notes and refunds. Every request is HMAC-verified
 * (Saas_Connector_Signature) and stays thin: the connector executes exactly
 * what WooCommerce core exposes (update_status, add_order_note,
 * wc_create_refund) and reports the outcome — all decisions live in the SaaS.
 *
 * Money safety (plan3 §2.2):
 *  - the refund amount is re-validated here against the remaining refundable
 *    amount — the connector never trusts the SaaS number alone;
 *  - the SaaS idempotency key is stamped onto the refund BEFORE any gateway
 *    call, so a retried command finds the existing refund instead of creating
 *    a second one, and a half-completed gateway refund can resume safely.
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_Orders {

	/** Refund meta: the SaaS idempotency key that created it. */
	const META_IDEMPOTENCY_KEY = '_saas_idempotency_key';

	/** Refund meta: set only after the gateway confirmed the money movement. */
	const META_GATEWAY_REFUNDED = '_saas_gateway_refunded';

	/**
	 * REST permission callback — verifies the SaaS HMAC signature.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return true|WP_Error
	 */
	public function authorize( WP_REST_Request $request ) {
		return Saas_Connector_Signature::authorize_rest( $request );
	}

	/**
	 * Resolve the order from the route or fail with a typed error.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WC_Order|WP_Error
	 */
	private function get_order( WP_REST_Request $request ) {
		$order_id = absint( $request['id'] );
		$order    = $order_id ? wc_get_order( $order_id ) : false;
		if ( ! $order instanceof WC_Order ) {
			return new WP_Error( 'order_not_found', 'Order not found.', array( 'status' => 404 ) );
		}
		return $order;
	}

	/**
	 * Non-sensitive order snapshot shared by the write responses.
	 *
	 * @param WC_Order $order Order.
	 * @return array<string,mixed>
	 */
	private function order_snapshot( WC_Order $order ) {
		return array(
			'wpOrderId'     => $order->get_id(),
			'status'        => $order->get_status(),
			'totalRefunded' => (string) $order->get_total_refunded(),
			'entityVersion' => Saas_Connector_Versioning::version_of( $order->get_date_modified() ),
		);
	}

	/**
	 * PUT /orders/{id}/status — run a status transition with all WooCommerce
	 * side effects (emails, stock, plugin hooks). Compare-and-set aware.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_status( WP_REST_Request $request ) {
		$order = $this->get_order( $request );
		if ( is_wp_error( $order ) ) {
			return $order;
		}

		$version_check = Saas_Connector_Versioning::check( $request, $order->get_date_modified() );
		if ( is_wp_error( $version_check ) ) {
			return $version_check;
		}

		$params = $request->get_json_params();
		$params = is_array( $params ) ? $params : array();
		$status = isset( $params['status'] ) ? sanitize_key( (string) $params['status'] ) : '';

		$allowed = array_map(
			static function ( $key ) {
				return str_replace( 'wc-', '', $key );
			},
			array_keys( wc_get_order_statuses() )
		);
		if ( '' === $status || ! in_array( $status, $allowed, true ) ) {
			return new WP_Error( 'invalid_status', 'Unknown order status.', array( 'status' => 400 ) );
		}

		if ( $order->get_status() !== $status ) {
			$order->update_status( $status, __( 'SaaS dashboard:', 'saas-connector' ) . ' ', true );
			// Reload so the snapshot reflects the transition's side effects.
			$order = wc_get_order( $order->get_id() );
		}

		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => $this->order_snapshot( $order ),
				'message' => 'Order status updated',
			),
			200
		);
	}

	/**
	 * GET /orders/{id}/notes — the order's notes, newest first.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function list_notes( WP_REST_Request $request ) {
		$order = $this->get_order( $request );
		if ( is_wp_error( $order ) ) {
			return $order;
		}

		$notes = wc_get_order_notes(
			array(
				'order_id' => $order->get_id(),
				'limit'    => 100,
			)
		);

		$items = array();
		foreach ( (array) $notes as $note ) {
			$items[] = array(
				'noteId'       => (int) $note->id,
				'note'         => (string) $note->content,
				'customerNote' => ! empty( $note->customer_note ),
				'addedBy'      => isset( $note->added_by ) ? (string) $note->added_by : null,
				'dateCreated'  => isset( $note->date_created ) && $note->date_created
					? $note->date_created->date( 'c' )
					: null,
			);
		}

		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array( 'items' => $items ),
				'message' => '',
			),
			200
		);
	}

	/**
	 * POST /orders/{id}/notes — add a private or customer-facing order note.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function add_note( WP_REST_Request $request ) {
		$order = $this->get_order( $request );
		if ( is_wp_error( $order ) ) {
			return $order;
		}

		$params = $request->get_json_params();
		$params = is_array( $params ) ? $params : array();

		$note = isset( $params['note'] ) ? sanitize_textarea_field( (string) $params['note'] ) : '';
		if ( '' === $note ) {
			return new WP_Error( 'invalid_note', 'Note text is required.', array( 'status' => 400 ) );
		}
		$customer_note = ! empty( $params['customerNote'] );

		$note_id = $order->add_order_note( $note, $customer_note );
		if ( ! $note_id ) {
			return new WP_Error( 'note_failed', 'Failed to add the order note.', array( 'status' => 500 ) );
		}

		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array(
					'noteId'       => (int) $note_id,
					'customerNote' => $customer_note,
				),
				'message' => 'Note added',
			),
			201
		);
	}

	/**
	 * POST /orders/{id}/refunds — create a refund; optionally move real money.
	 *
	 * NOT wrapped by the generic idempotency store: refunds implement their own
	 * domain idempotency (refund meta keyed on the SaaS idempotency key) so a
	 * replay can also COMPLETE a half-finished gateway refund.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function create_refund( WP_REST_Request $request ) {
		$order = $this->get_order( $request );
		if ( is_wp_error( $order ) ) {
			return $order;
		}

		$params = $request->get_json_params();
		$params = is_array( $params ) ? $params : array();

		$idempotency_key = (string) $request->get_header( Saas_Connector_Idempotency::HEADER_KEY );
		$amount          = isset( $params['amount'] ) ? (float) wc_format_decimal( (string) $params['amount'] ) : 0.0;
		$reason          = isset( $params['reason'] ) ? sanitize_textarea_field( (string) $params['reason'] ) : '';
		$refund_payment  = ! empty( $params['refundPayment'] );
		$restock_items   = ! empty( $params['restockItems'] );

		// Currency guard (plan3 §2.2): the SaaS states the currency explicitly.
		$currency = isset( $params['currency'] ) ? strtoupper( sanitize_text_field( (string) $params['currency'] ) ) : '';
		if ( '' !== $currency && $currency !== $order->get_currency() ) {
			return new WP_Error(
				'currency_mismatch',
				sprintf( 'Refund currency %s does not match the order currency %s.', $currency, $order->get_currency() ),
				array( 'status' => 400 )
			);
		}

		// Replay: a refund carrying this idempotency key already exists.
		$existing = $this->find_refund_by_key( $order, $idempotency_key );
		if ( $existing instanceof WC_Order_Refund ) {
			$completed = $this->maybe_complete_gateway_refund( $order, $existing, $refund_payment, $reason );
			if ( is_wp_error( $completed ) ) {
				return $completed;
			}
			return $this->refund_response( $order, $existing, true );
		}

		// Server-side amount validation — never trust the SaaS number alone.
		$remaining = (float) $order->get_total() - (float) $order->get_total_refunded();
		if ( $amount <= 0 || $amount > $remaining + 0.005 ) {
			return new WP_Error(
				'invalid_amount',
				sprintf( 'Refund amount must be between 0 and the remaining refundable amount (%s).', wc_format_decimal( $remaining ) ),
				array( 'status' => 400 )
			);
		}

		// Gateway support is checked BEFORE creating anything.
		if ( $refund_payment && ! $this->gateway_supports_refunds( $order ) ) {
			return new WP_Error(
				'gateway_no_refunds',
				'The order\'s payment gateway does not support automatic refunds.',
				array( 'status' => 400 )
			);
		}

		// 1) Create the refund record WITHOUT moving money.
		$refund = wc_create_refund(
			array(
				'order_id'       => $order->get_id(),
				'amount'         => $amount,
				'reason'         => $reason,
				'refund_payment' => false,
				'restock_items'  => $restock_items,
			)
		);
		if ( is_wp_error( $refund ) ) {
			return new WP_Error( 'refund_failed', $refund->get_error_message(), array( 'status' => 500 ) );
		}

		// 2) Stamp the idempotency key BEFORE any gateway call (plan3 §2.2).
		if ( '' !== $idempotency_key ) {
			$refund->update_meta_data( self::META_IDEMPOTENCY_KEY, $idempotency_key );
		}
		$refund->update_meta_data( '_saas_origin', 'saas' );
		$refund->save();

		// 3) Optionally move the money; roll the record back on gateway failure
		//    (mirrors wc_create_refund's own refund_payment behavior).
		if ( $refund_payment ) {
			$gateway_result = $this->process_gateway_refund( $order, (float) $refund->get_amount(), $reason );
			if ( is_wp_error( $gateway_result ) ) {
				wp_delete_post( $refund->get_id(), true );
				return $gateway_result;
			}
			$refund->update_meta_data( self::META_GATEWAY_REFUNDED, 'yes' );
			$refund->save();
		}

		// Reload for an accurate post-refund snapshot (Woo may auto-set the
		// order to "refunded" on a full refund).
		$order = wc_get_order( $order->get_id() );

		return $this->refund_response( $order, $refund, false );
	}

	/**
	 * GET /orders/{id}/refunds — the order's refunds (non-sensitive summary).
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function list_refunds( WP_REST_Request $request ) {
		$order = $this->get_order( $request );
		if ( is_wp_error( $order ) ) {
			return $order;
		}

		$items = array();
		foreach ( $order->get_refunds() as $refund ) {
			$items[] = $this->refund_data( $refund );
		}

		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array( 'items' => $items ),
				'message' => '',
			),
			200
		);
	}

	/* ------------------------------ Helpers ------------------------------- */

	/**
	 * Locate an existing refund carrying the SaaS idempotency key.
	 *
	 * @param WC_Order $order Order.
	 * @param string   $key   Idempotency key ('' disables the lookup).
	 * @return WC_Order_Refund|null
	 */
	private function find_refund_by_key( WC_Order $order, $key ) {
		if ( '' === $key ) {
			return null;
		}
		foreach ( $order->get_refunds() as $refund ) {
			if ( $refund->get_meta( self::META_IDEMPOTENCY_KEY ) === $key ) {
				return $refund;
			}
		}
		return null;
	}

	/**
	 * On replay: if the money movement was requested but never confirmed,
	 * attempt it now and stamp the flag (idempotent completion).
	 *
	 * @param WC_Order        $order          Order.
	 * @param WC_Order_Refund $refund         Existing refund.
	 * @param bool            $refund_payment Whether money movement is requested.
	 * @param string          $reason         Refund reason.
	 * @return true|WP_Error
	 */
	private function maybe_complete_gateway_refund( WC_Order $order, WC_Order_Refund $refund, $refund_payment, $reason ) {
		if ( ! $refund_payment || 'yes' === $refund->get_meta( self::META_GATEWAY_REFUNDED ) ) {
			return true;
		}
		if ( ! $this->gateway_supports_refunds( $order ) ) {
			return new WP_Error(
				'gateway_no_refunds',
				'The order\'s payment gateway does not support automatic refunds.',
				array( 'status' => 400 )
			);
		}
		$result = $this->process_gateway_refund( $order, (float) $refund->get_amount(), $reason );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$refund->update_meta_data( self::META_GATEWAY_REFUNDED, 'yes' );
		$refund->save();
		return true;
	}

	/**
	 * Whether the order's gateway can process automatic refunds.
	 *
	 * @param WC_Order $order Order.
	 * @return bool
	 */
	private function gateway_supports_refunds( WC_Order $order ) {
		$gateway = $this->resolve_gateway( $order );
		return $gateway instanceof WC_Payment_Gateway && $gateway->supports( 'refunds' );
	}

	/**
	 * The payment gateway that took the order's payment, or null.
	 *
	 * @param WC_Order $order Order.
	 * @return WC_Payment_Gateway|null
	 */
	private function resolve_gateway( WC_Order $order ) {
		$method = $order->get_payment_method();
		if ( '' === $method || ! function_exists( 'WC' ) ) {
			return null;
		}
		$gateways = WC()->payment_gateways() ? WC()->payment_gateways()->payment_gateways() : array();
		return isset( $gateways[ $method ] ) ? $gateways[ $method ] : null;
	}

	/**
	 * Move money back through the gateway.
	 *
	 * @param WC_Order $order  Order.
	 * @param float    $amount Refund amount.
	 * @param string   $reason Refund reason.
	 * @return true|WP_Error
	 */
	private function process_gateway_refund( WC_Order $order, $amount, $reason ) {
		$gateway = $this->resolve_gateway( $order );
		if ( ! $gateway instanceof WC_Payment_Gateway ) {
			return new WP_Error( 'gateway_missing', 'The order\'s payment gateway is not available.', array( 'status' => 400 ) );
		}
		$result = $gateway->process_refund( $order->get_id(), $amount, $reason );
		if ( is_wp_error( $result ) || true !== $result ) {
			// Log the raw gateway message server-side ONLY; return a generic
			// message so processor detail / tokens never reach the SaaS or its
			// client-facing error surface (Phase 32 audit fix).
			if ( is_wp_error( $result ) && function_exists( 'wc_get_logger' ) ) {
				wc_get_logger()->error(
					'SaaS refund: gateway declined order #' . $order->get_id() . ': ' . $result->get_error_message(),
					array( 'source' => 'saas-connector' )
				);
			}
			return new WP_Error(
				'gateway_refund_failed',
				'The payment gateway declined the refund.',
				array( 'status' => 502 )
			);
		}
		return true;
	}

	/**
	 * Non-sensitive refund summary.
	 *
	 * @param WC_Order_Refund $refund Refund.
	 * @return array<string,mixed>
	 */
	private function refund_data( WC_Order_Refund $refund ) {
		$created = $refund->get_date_created();
		return array(
			'wpRefundId'      => $refund->get_id(),
			'amount'          => (string) $refund->get_amount(),
			'reason'          => (string) $refund->get_reason(),
			'refundedPayment' => 'yes' === $refund->get_meta( self::META_GATEWAY_REFUNDED ) || (bool) $refund->get_refunded_payment(),
			'dateCreated'     => $created ? $created->date( 'c' ) : null,
		);
	}

	/**
	 * Success envelope for a created/replayed refund.
	 *
	 * @param WC_Order        $order    Order (fresh snapshot).
	 * @param WC_Order_Refund $refund   Refund.
	 * @param bool            $replayed Whether this was an idempotent replay.
	 * @return WP_REST_Response
	 */
	private function refund_response( WC_Order $order, WC_Order_Refund $refund, $replayed ) {
		$snapshot = $this->order_snapshot( $order );
		$data     = array_merge(
			$this->refund_data( $refund ),
			array(
				'orderStatus'   => $snapshot['status'],
				'totalRefunded' => $snapshot['totalRefunded'],
				'entityVersion' => $snapshot['entityVersion'],
			)
		);
		if ( $replayed ) {
			$data['replayed'] = true;
		}
		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => $data,
				'message' => $replayed ? 'Refund already processed' : 'Refund created',
			),
			201
		);
	}
}
