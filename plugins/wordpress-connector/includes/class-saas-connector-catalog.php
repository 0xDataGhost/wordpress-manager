<?php
/**
 * Catalog write endpoints called by the SaaS (Phase 26, plan3).
 *
 * Variations, taxonomies (categories/tags/attributes), media sideload, bulk
 * product operations and product deletion. HMAC-verified and thin: each handler
 * wraps the corresponding WooCommerce/WordPress CRUD object and returns a
 * normalized, non-sensitive response.
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_Catalog {

	/** Product statuses the SaaS may set on bulk/delete flows. */
	private static $allowed_statuses = array( 'publish', 'draft', 'private', 'pending' );

	/**
	 * REST permission callback — verifies the SaaS HMAC signature.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return true|WP_Error
	 */
	public function authorize( WP_REST_Request $request ) {
		return Saas_Connector_Signature::authorize_rest( $request );
	}

	/* ----------------------------- Variations ----------------------------- */

	/**
	 * Resolve a variable product from the route.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WC_Product_Variable|WP_Error
	 */
	private function get_variable_product( WP_REST_Request $request ) {
		$product_id = absint( $request['id'] );
		$product    = $product_id ? wc_get_product( $product_id ) : false;
		if ( ! $product ) {
			return new WP_Error( 'not_found', 'Product not found.', array( 'status' => 404 ) );
		}
		// Promote a simple product to variable so the SaaS can build variations.
		if ( ! $product->is_type( 'variable' ) ) {
			wp_set_object_terms( $product_id, 'variable', 'product_type' );
			$product = wc_get_product( $product_id );
		}
		return $product;
	}

	/**
	 * POST /products/{id}/variations — create a variation.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function create_variation( WP_REST_Request $request ) {
		$product = $this->get_variable_product( $request );
		if ( is_wp_error( $product ) ) {
			return $product;
		}
		$variation = new WC_Product_Variation();
		$variation->set_parent_id( $product->get_id() );
		$this->apply_variation( $variation, $request );
		$variation_id = $variation->save();
		if ( ! $variation_id ) {
			return new WP_Error( 'variation_failed', 'Failed to create the variation.', array( 'status' => 500 ) );
		}
		return $this->variation_response( wc_get_product( $variation_id ), 201 );
	}

	/**
	 * PUT /products/{id}/variations/{variationId} — update a variation.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_variation( WP_REST_Request $request ) {
		$product_id   = absint( $request['id'] );
		$variation_id = absint( $request['variationId'] );
		$variation    = $variation_id ? wc_get_product( $variation_id ) : false;
		if ( ! $variation instanceof WC_Product_Variation || $variation->get_parent_id() !== $product_id ) {
			return new WP_Error( 'not_found', 'Variation not found.', array( 'status' => 404 ) );
		}
		$this->apply_variation( $variation, $request );
		$variation->save();
		return $this->variation_response( $variation, 200 );
	}

	/**
	 * DELETE /products/{id}/variations/{variationId} — delete a variation.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function delete_variation( WP_REST_Request $request ) {
		$product_id   = absint( $request['id'] );
		$variation_id = absint( $request['variationId'] );
		$variation    = $variation_id ? wc_get_product( $variation_id ) : false;
		if ( ! $variation instanceof WC_Product_Variation || $variation->get_parent_id() !== $product_id ) {
			return new WP_Error( 'not_found', 'Variation not found.', array( 'status' => 404 ) );
		}
		$variation->delete( true );
		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array( 'wpVariationId' => $variation_id, 'deleted' => true ),
				'message' => 'Variation deleted',
			),
			200
		);
	}

	/**
	 * Apply variation fields from the request.
	 *
	 * @param WC_Product_Variation $variation Variation.
	 * @param WP_REST_Request      $request   Incoming request.
	 */
	private function apply_variation( WC_Product_Variation $variation, WP_REST_Request $request ) {
		$params = $request->get_json_params();
		$params = is_array( $params ) ? $params : array();

		if ( isset( $params['regularPrice'] ) ) {
			$variation->set_regular_price( wc_format_decimal( (string) $params['regularPrice'] ) );
		}
		if ( array_key_exists( 'salePrice', $params ) ) {
			$variation->set_sale_price(
				null === $params['salePrice'] ? '' : wc_format_decimal( (string) $params['salePrice'] )
			);
		}
		if ( array_key_exists( 'stockQuantity', $params ) ) {
			if ( null === $params['stockQuantity'] ) {
				$variation->set_manage_stock( false );
			} else {
				$variation->set_manage_stock( true );
				$variation->set_stock_quantity( max( 0, (int) $params['stockQuantity'] ) );
			}
		}
		if ( isset( $params['status'] ) && in_array( $params['status'], array( 'publish', 'private' ), true ) ) {
			$variation->set_status( sanitize_key( (string) $params['status'] ) );
		}
		if ( isset( $params['attributes'] ) && is_array( $params['attributes'] ) ) {
			$attributes = array();
			foreach ( $params['attributes'] as $name => $value ) {
				$attributes[ sanitize_title( (string) $name ) ] = sanitize_text_field( (string) $value );
			}
			$variation->set_attributes( $attributes );
		}
	}

	/**
	 * Non-sensitive variation response.
	 *
	 * @param WC_Product_Variation $variation Variation.
	 * @param int                  $status    HTTP status.
	 * @return WP_REST_Response
	 */
	private function variation_response( WC_Product_Variation $variation, $status ) {
		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array(
					'wpVariationId' => $variation->get_id(),
					'regularPrice'  => (string) $variation->get_regular_price(),
					'salePrice'     => (string) $variation->get_sale_price(),
					'stockQuantity' => $variation->get_manage_stock() ? (int) $variation->get_stock_quantity() : null,
					'status'        => $variation->get_status(),
				),
				'message' => '',
			),
			$status
		);
	}

	/* ----------------------------- Taxonomies ----------------------------- */

	/**
	 * Map the URL taxonomy segment to the WordPress taxonomy name.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return string|WP_Error
	 */
	private function resolve_taxonomy( WP_REST_Request $request ) {
		$slug = sanitize_key( (string) $request['taxonomy'] );
		$map  = array(
			'categories' => 'product_cat',
			'tags'       => 'product_tag',
			'attributes' => 'product_attribute',
		);
		if ( ! isset( $map[ $slug ] ) ) {
			return new WP_Error( 'invalid_taxonomy', 'Unknown taxonomy.', array( 'status' => 400 ) );
		}
		return $map[ $slug ];
	}

	/**
	 * POST /taxonomies/{taxonomy} — create a term (or global attribute).
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function create_taxonomy( WP_REST_Request $request ) {
		$taxonomy = $this->resolve_taxonomy( $request );
		if ( is_wp_error( $taxonomy ) ) {
			return $taxonomy;
		}
		$params = $request->get_json_params();
		$params = is_array( $params ) ? $params : array();
		$name   = isset( $params['name'] ) ? sanitize_text_field( (string) $params['name'] ) : '';
		if ( '' === $name ) {
			return new WP_Error( 'invalid_name', 'Name is required.', array( 'status' => 400 ) );
		}

		if ( 'product_attribute' === $taxonomy ) {
			return $this->create_attribute( $name, $params );
		}

		$args = array();
		if ( ! empty( $params['slug'] ) ) {
			$args['slug'] = sanitize_title( (string) $params['slug'] );
		}
		if ( ! empty( $params['description'] ) ) {
			$args['description'] = sanitize_textarea_field( (string) $params['description'] );
		}
		if ( ! empty( $params['parentWpId'] ) && 'product_cat' === $taxonomy ) {
			$args['parent'] = absint( $params['parentWpId'] );
		}
		$result = wp_insert_term( $name, $taxonomy, $args );
		if ( is_wp_error( $result ) ) {
			return new WP_Error( 'term_failed', $result->get_error_message(), array( 'status' => 400 ) );
		}
		return $this->term_response( $taxonomy, (int) $result['term_id'], 201 );
	}

	/**
	 * PUT /taxonomies/{taxonomy}/{id} — update a term.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_taxonomy( WP_REST_Request $request ) {
		$taxonomy = $this->resolve_taxonomy( $request );
		if ( is_wp_error( $taxonomy ) ) {
			return $taxonomy;
		}
		$term_id = absint( $request['id'] );
		$params  = $request->get_json_params();
		$params  = is_array( $params ) ? $params : array();

		if ( 'product_attribute' === $taxonomy ) {
			return $this->update_attribute( $term_id, $params );
		}

		$args = array();
		if ( isset( $params['name'] ) ) {
			$args['name'] = sanitize_text_field( (string) $params['name'] );
		}
		if ( isset( $params['slug'] ) ) {
			$args['slug'] = sanitize_title( (string) $params['slug'] );
		}
		if ( array_key_exists( 'description', $params ) ) {
			$args['description'] = sanitize_textarea_field( (string) $params['description'] );
		}
		if ( array_key_exists( 'parentWpId', $params ) && 'product_cat' === $taxonomy ) {
			$args['parent'] = $params['parentWpId'] ? absint( $params['parentWpId'] ) : 0;
		}
		$result = wp_update_term( $term_id, $taxonomy, $args );
		if ( is_wp_error( $result ) ) {
			return new WP_Error( 'term_failed', $result->get_error_message(), array( 'status' => 400 ) );
		}
		return $this->term_response( $taxonomy, $term_id, 200 );
	}

	/**
	 * DELETE /taxonomies/{taxonomy}/{id} — delete a term.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function delete_taxonomy( WP_REST_Request $request ) {
		$taxonomy = $this->resolve_taxonomy( $request );
		if ( is_wp_error( $taxonomy ) ) {
			return $taxonomy;
		}
		$term_id = absint( $request['id'] );

		if ( 'product_attribute' === $taxonomy ) {
			$deleted = wc_delete_attribute( $term_id );
			if ( ! $deleted ) {
				return new WP_Error( 'delete_failed', 'Failed to delete the attribute.', array( 'status' => 400 ) );
			}
		} else {
			$result = wp_delete_term( $term_id, $taxonomy );
			if ( is_wp_error( $result ) || ! $result ) {
				return new WP_Error( 'delete_failed', 'Failed to delete the term.', array( 'status' => 400 ) );
			}
		}
		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array( 'wpTermId' => $term_id, 'deleted' => true ),
				'message' => 'Term deleted',
			),
			200
		);
	}

	/**
	 * Create a global product attribute (pa_*).
	 *
	 * @param string               $name   Attribute label.
	 * @param array<string,mixed>  $params Request params.
	 * @return WP_REST_Response|WP_Error
	 */
	private function create_attribute( $name, array $params ) {
		$slug = ! empty( $params['slug'] ) ? sanitize_title( (string) $params['slug'] ) : sanitize_title( $name );
		$id   = wc_create_attribute(
			array(
				'name'    => $name,
				'slug'    => $slug,
				'type'    => 'select',
				'orderby' => 'menu_order',
			)
		);
		if ( is_wp_error( $id ) ) {
			return new WP_Error( 'attribute_failed', $id->get_error_message(), array( 'status' => 400 ) );
		}
		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array(
					'wpTermId'    => (int) $id,
					'name'        => $name,
					'slug'        => $slug,
					'description' => null,
					'parentWpId'  => null,
					'count'       => 0,
				),
				'message' => '',
			),
			201
		);
	}

	/**
	 * Update a global product attribute.
	 *
	 * @param int                  $id     Attribute id.
	 * @param array<string,mixed>  $params Request params.
	 * @return WP_REST_Response|WP_Error
	 */
	private function update_attribute( $id, array $params ) {
		$args = array();
		if ( isset( $params['name'] ) ) {
			$args['name'] = sanitize_text_field( (string) $params['name'] );
		}
		if ( isset( $params['slug'] ) ) {
			$args['slug'] = sanitize_title( (string) $params['slug'] );
		}
		$result = wc_update_attribute( $id, $args );
		if ( is_wp_error( $result ) ) {
			return new WP_Error( 'attribute_failed', $result->get_error_message(), array( 'status' => 400 ) );
		}
		$attribute = wc_get_attribute( $id );
		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array(
					'wpTermId'    => (int) $id,
					'name'        => $attribute ? $attribute->name : '',
					'slug'        => $attribute ? $attribute->slug : '',
					'description' => null,
					'parentWpId'  => null,
					'count'       => 0,
				),
				'message' => '',
			),
			200
		);
	}

	/**
	 * Non-sensitive term response.
	 *
	 * @param string $taxonomy Taxonomy name.
	 * @param int    $term_id  Term id.
	 * @param int    $status   HTTP status.
	 * @return WP_REST_Response|WP_Error
	 */
	private function term_response( $taxonomy, $term_id, $status ) {
		$term = get_term( $term_id, $taxonomy );
		if ( ! $term instanceof WP_Term ) {
			return new WP_Error( 'term_failed', 'Term could not be loaded.', array( 'status' => 500 ) );
		}
		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array(
					'wpTermId'    => (int) $term->term_id,
					'name'        => $term->name,
					'slug'        => $term->slug,
					'description' => $term->description,
					'parentWpId'  => $term->parent ? (int) $term->parent : null,
					'count'       => (int) $term->count,
				),
				'message' => '',
			),
			$status
		);
	}

	/* -------------------------------- Media ------------------------------- */

	/**
	 * POST /media — sideload an image by URL and optionally attach it.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function create_media( WP_REST_Request $request ) {
		$params     = $request->get_json_params();
		$params     = is_array( $params ) ? $params : array();
		$source_url = isset( $params['sourceUrl'] ) ? esc_url_raw( (string) $params['sourceUrl'] ) : '';
		if ( '' === $source_url ) {
			return new WP_Error( 'invalid_url', 'A valid source URL is required.', array( 'status' => 400 ) );
		}

		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';

		$attach_to = isset( $params['attachToWpProductId'] ) ? absint( $params['attachToWpProductId'] ) : 0;
		$tmp       = download_url( $source_url );
		if ( is_wp_error( $tmp ) ) {
			return new WP_Error( 'download_failed', $tmp->get_error_message(), array( 'status' => 502 ) );
		}
		$file_array = array(
			'name'     => basename( wp_parse_url( $source_url, PHP_URL_PATH ) ),
			'tmp_name' => $tmp,
		);
		$attachment_id = media_handle_sideload( $file_array, $attach_to );
		if ( is_wp_error( $attachment_id ) ) {
			// media_handle_sideload cleans up $tmp on failure.
			return new WP_Error( 'sideload_failed', $attachment_id->get_error_message(), array( 'status' => 500 ) );
		}

		if ( ! empty( $params['altText'] ) ) {
			update_post_meta( $attachment_id, '_wp_attachment_image_alt', sanitize_text_field( (string) $params['altText'] ) );
		}

		$as_featured = ! empty( $params['asFeatured'] );
		if ( $attach_to && function_exists( 'wc_get_product' ) ) {
			$product = wc_get_product( $attach_to );
			if ( $product instanceof WC_Product ) {
				if ( $as_featured ) {
					$product->set_image_id( $attachment_id );
				} else {
					$gallery   = $product->get_gallery_image_ids();
					$gallery[] = $attachment_id;
					$product->set_gallery_image_ids( array_values( array_unique( $gallery ) ) );
				}
				$product->save();
			}
		}

		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array(
					'wpAttachmentId' => (int) $attachment_id,
					'src'            => wp_get_attachment_url( $attachment_id ),
				),
				'message' => '',
			),
			201
		);
	}

	/* -------------------------------- Bulk -------------------------------- */

	/**
	 * POST /products/bulk — apply price/stock/status to a bounded batch.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function bulk_update( WP_REST_Request $request ) {
		$params = $request->get_json_params();
		$params = is_array( $params ) ? $params : array();
		$items  = isset( $params['items'] ) && is_array( $params['items'] ) ? $params['items'] : array();
		if ( count( $items ) > 50 ) {
			return new WP_Error( 'too_many', 'A bulk batch is limited to 50 items.', array( 'status' => 400 ) );
		}

		$results = array();
		foreach ( $items as $item ) {
			$wp_id   = isset( $item['wpProductId'] ) ? absint( $item['wpProductId'] ) : 0;
			$product = $wp_id ? wc_get_product( $wp_id ) : false;
			if ( ! $product instanceof WC_Product ) {
				$results[] = array( 'wpProductId' => $wp_id, 'ok' => false, 'message' => 'Not found' );
				continue;
			}
			if ( isset( $item['regularPrice'] ) ) {
				$product->set_regular_price( wc_format_decimal( (string) $item['regularPrice'] ) );
			}
			if ( isset( $item['stockQuantity'] ) ) {
				$product->set_manage_stock( true );
				$product->set_stock_quantity( max( 0, (int) $item['stockQuantity'] ) );
			}
			if ( isset( $item['status'] ) ) {
				$status = $this->map_status( (string) $item['status'] );
				if ( in_array( $status, self::$allowed_statuses, true ) ) {
					$product->set_status( $status );
				}
			}
			$product->save();
			$results[] = array( 'wpProductId' => $wp_id, 'ok' => true, 'message' => null );
		}

		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array( 'items' => $results ),
				'message' => '',
			),
			200
		);
	}

	/**
	 * Map a SaaS product status onto a WooCommerce status.
	 *
	 * @param string $status SaaS status.
	 * @return string
	 */
	private function map_status( $status ) {
		switch ( $status ) {
			case 'active':
				return 'publish';
			case 'archived':
				return 'private';
			case 'draft':
				return 'draft';
			default:
				return $status;
		}
	}

	/* ------------------------------- Delete ------------------------------- */

	/**
	 * DELETE /products/{id} — trash by default; force to permanently delete.
	 *
	 * @param WP_REST_Request $request Incoming request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function delete_product( WP_REST_Request $request ) {
		$product_id = absint( $request['id'] );
		$product    = $product_id ? wc_get_product( $product_id ) : false;
		if ( ! $product instanceof WC_Product ) {
			return new WP_Error( 'not_found', 'Product not found.', array( 'status' => 404 ) );
		}
		$params = $request->get_json_params();
		$params = is_array( $params ) ? $params : array();
		$force  = ! empty( $params['force'] );

		$product->delete( $force );

		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array(
					'wpProductId' => $product_id,
					'forced'      => $force,
					'deleted'     => true,
				),
				'message' => $force ? 'Product deleted' : 'Product trashed',
			),
			200
		);
	}
}
