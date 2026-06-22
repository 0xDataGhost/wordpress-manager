<?php
/**
 * Admin UI: the "SaaS Connector" settings page.
 *
 * Every state-changing action is gated by a capability check (manage_options)
 * and a nonce, every input is sanitized, and every output is escaped. The page
 * only ever talks to the SaaS through Saas_Connector_Api_Client.
 *
 * @package SaasConnector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saas_Connector_Admin {

	const PAGE_SLUG  = 'saas-connector';
	const CAPABILITY = 'manage_options';
	const NONCE      = 'saas_connector_action';

	/**
	 * Register menu and admin-post handlers.
	 */
	public function register() {
		add_action( 'admin_menu', array( $this, 'add_menu' ) );
		add_action( 'admin_post_saas_connector_connect', array( $this, 'handle_connect' ) );
		add_action( 'admin_post_saas_connector_health', array( $this, 'handle_health' ) );
		add_action( 'admin_post_saas_connector_sync', array( $this, 'handle_sync' ) );
		add_action( 'admin_post_saas_connector_disconnect', array( $this, 'handle_disconnect' ) );
	}

	/**
	 * Add the top-level admin menu page.
	 */
	public function add_menu() {
		add_menu_page(
			__( 'SaaS Connector', 'saas-connector' ),
			__( 'SaaS Connector', 'saas-connector' ),
			self::CAPABILITY,
			self::PAGE_SLUG,
			array( $this, 'render_page' ),
			'dashicons-cloud',
			58
		);
	}

	/**
	 * Render the settings page.
	 */
	public function render_page() {
		if ( ! current_user_can( self::CAPABILITY ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'saas-connector' ) );
		}

		$api_url      = Saas_Connector_Settings::get( 'api_url' );
		$api_key      = Saas_Connector_Settings::get( 'api_key' );
		$status       = Saas_Connector_Settings::get( 'status' );
		$store_name   = Saas_Connector_Settings::get( 'store_name' );
		$last_checked = Saas_Connector_Settings::get( 'last_checked' );
		$last_synced  = Saas_Connector_Settings::get( 'last_synced' );
		$connected    = Saas_Connector_Settings::is_connected();
		$action_url   = esc_url( admin_url( 'admin-post.php' ) );

		$this->render_notice();
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'SaaS Connector', 'saas-connector' ); ?></h1>
			<p class="description">
				<?php esc_html_e( 'Connect this WooCommerce store to the SaaS Operations Dashboard.', 'saas-connector' ); ?>
			</p>

			<h2><?php esc_html_e( 'Connection Status', 'saas-connector' ); ?></h2>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php esc_html_e( 'Status', 'saas-connector' ); ?></th>
					<td>
						<span class="saas-status saas-status--<?php echo esc_attr( $status ); ?>">
							<strong><?php echo esc_html( $this->status_label( $status ) ); ?></strong>
						</span>
					</td>
				</tr>
				<?php if ( '' !== $store_name ) : ?>
				<tr>
					<th scope="row"><?php esc_html_e( 'Linked Store', 'saas-connector' ); ?></th>
					<td><?php echo esc_html( $store_name ); ?></td>
				</tr>
				<?php endif; ?>
				<?php if ( '' !== $last_checked ) : ?>
				<tr>
					<th scope="row"><?php esc_html_e( 'Last Checked', 'saas-connector' ); ?></th>
					<td><?php echo esc_html( $last_checked ); ?></td>
				</tr>
				<?php endif; ?>
				<?php if ( '' !== $last_synced ) : ?>
				<tr>
					<th scope="row"><?php esc_html_e( 'Last Synced', 'saas-connector' ); ?></th>
					<td><?php echo esc_html( $last_synced ); ?></td>
				</tr>
				<?php endif; ?>
			</table>

			<h2><?php esc_html_e( 'Settings', 'saas-connector' ); ?></h2>
			<form method="post" action="<?php echo $action_url; // phpcs:ignore WordPress.Security.EscapeOutput -- pre-escaped above. ?>">
				<input type="hidden" name="action" value="saas_connector_connect" />
				<?php wp_nonce_field( self::NONCE ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row">
							<label for="saas_api_url"><?php esc_html_e( 'SaaS API URL', 'saas-connector' ); ?></label>
						</th>
						<td>
							<input
								name="api_url"
								id="saas_api_url"
								type="url"
								class="regular-text"
								value="<?php echo esc_attr( $api_url ); ?>"
								placeholder="https://app.example.com/api/v1"
							/>
							<p class="description">
								<?php esc_html_e( 'The base URL of the SaaS API, including the version prefix.', 'saas-connector' ); ?>
							</p>
						</td>
					</tr>
					<tr>
						<th scope="row">
							<label for="saas_api_key"><?php esc_html_e( 'API Key', 'saas-connector' ); ?></label>
						</th>
						<td>
							<input
								name="api_key"
								id="saas_api_key"
								type="password"
								class="regular-text"
								autocomplete="off"
								value="<?php echo esc_attr( $api_key ); ?>"
								placeholder="wpc_..."
							/>
							<p class="description">
								<?php esc_html_e( 'Generate this key in the SaaS dashboard and paste it here. It is shown only once there.', 'saas-connector' ); ?>
							</p>
						</td>
					</tr>
				</table>
				<?php submit_button( $connected ? __( 'Save & Reconnect', 'saas-connector' ) : __( 'Connect', 'saas-connector' ) ); ?>
			</form>

			<h2><?php esc_html_e( 'Actions', 'saas-connector' ); ?></h2>
			<p>
				<form method="post" action="<?php echo $action_url; // phpcs:ignore WordPress.Security.EscapeOutput -- pre-escaped above. ?>" style="display:inline">
					<input type="hidden" name="action" value="saas_connector_health" />
					<?php wp_nonce_field( self::NONCE ); ?>
					<?php submit_button( __( 'Run Health Check', 'saas-connector' ), 'secondary', 'submit', false ); ?>
				</form>
				<form method="post" action="<?php echo $action_url; // phpcs:ignore WordPress.Security.EscapeOutput -- pre-escaped above. ?>" style="display:inline">
					<input type="hidden" name="action" value="saas_connector_sync" />
					<?php wp_nonce_field( self::NONCE ); ?>
					<?php submit_button( __( 'Manual Sync', 'saas-connector' ), 'secondary', 'submit', false, $connected ? array() : array( 'disabled' => 'disabled' ) ); ?>
				</form>
				<form method="post" action="<?php echo $action_url; // phpcs:ignore WordPress.Security.EscapeOutput -- pre-escaped above. ?>" style="display:inline">
					<input type="hidden" name="action" value="saas_connector_disconnect" />
					<?php wp_nonce_field( self::NONCE ); ?>
					<?php submit_button( __( 'Disconnect', 'saas-connector' ), 'delete', 'submit', false ); ?>
				</form>
			</p>
		</div>
		<?php
	}

	/**
	 * Handle "Connect": save settings, then call the SaaS /wp/connect.
	 */
	public function handle_connect() {
		$this->guard();

		$api_url = isset( $_POST['api_url'] )
			? esc_url_raw( wp_unslash( $_POST['api_url'] ) )
			: '';
		$api_key = isset( $_POST['api_key'] )
			? sanitize_text_field( wp_unslash( $_POST['api_key'] ) )
			: '';

		Saas_Connector_Settings::update(
			array(
				'api_url' => $api_url,
				'api_key' => $api_key,
			)
		);

		if ( '' === $api_url || '' === $api_key ) {
			$this->redirect_with_notice( 'error', __( 'Both the SaaS API URL and API Key are required.', 'saas-connector' ) );
		}

		$result = Saas_Connector_Api_Client::connect( $api_url, $api_key );

		if ( $result['ok'] ) {
			$store_name = isset( $result['data']['storeName'] ) ? sanitize_text_field( (string) $result['data']['storeName'] ) : '';
			Saas_Connector_Settings::update(
				array(
					'status'       => 'connected',
					'store_name'   => $store_name,
					'last_checked' => $this->now(),
				)
			);
			$this->redirect_with_notice( 'success', __( 'Store connected to the SaaS dashboard.', 'saas-connector' ) );
		}

		Saas_Connector_Settings::update( array( 'status' => 'disconnected' ) );
		$this->redirect_with_notice( 'error', $result['message'] );
	}

	/**
	 * Handle "Run Health Check": verify credentials against /wp/verify.
	 */
	public function handle_health() {
		$this->guard();

		$api_url = Saas_Connector_Settings::get( 'api_url' );
		$api_key = Saas_Connector_Settings::get( 'api_key' );

		if ( '' === $api_url || '' === $api_key ) {
			$this->redirect_with_notice( 'error', __( 'Configure and connect the store first.', 'saas-connector' ) );
		}

		$result = Saas_Connector_Api_Client::verify( $api_url, $api_key );

		if ( $result['ok'] ) {
			Saas_Connector_Settings::update( array( 'last_checked' => $this->now() ) );
			$this->redirect_with_notice( 'success', __( 'Connector credentials are valid.', 'saas-connector' ) );
		}

		$this->redirect_with_notice( 'error', $result['message'] );
	}

	/**
	 * Handle "Manual Sync": ask the SaaS to pull WooCommerce data via /wp/sync.
	 * The SaaS performs the sync (pulling from this site's read endpoints) and
	 * returns a summary; we record the time and surface the result.
	 */
	public function handle_sync() {
		$this->guard();

		$api_url = Saas_Connector_Settings::get( 'api_url' );
		$api_key = Saas_Connector_Settings::get( 'api_key' );

		if ( '' === $api_url || '' === $api_key ) {
			$this->redirect_with_notice( 'error', __( 'Configure and connect the store first.', 'saas-connector' ) );
		}

		$result = Saas_Connector_Api_Client::sync( $api_url, $api_key, 'all' );

		if ( $result['ok'] ) {
			Saas_Connector_Settings::update( array( 'last_synced' => $this->now() ) );
			$created = isset( $result['data']['job']['createdCount'] ) ? (int) $result['data']['job']['createdCount'] : 0;
			$updated = isset( $result['data']['job']['updatedCount'] ) ? (int) $result['data']['job']['updatedCount'] : 0;
			$this->redirect_with_notice(
				'success',
				sprintf(
					/* translators: 1: created count, 2: updated count. */
					__( 'Sync completed. %1$d created, %2$d updated.', 'saas-connector' ),
					$created,
					$updated
				)
			);
		}

		$this->redirect_with_notice( 'error', sanitize_text_field( (string) $result['message'] ) );
	}

	/**
	 * Handle "Disconnect": notify the SaaS, then clear local credentials.
	 */
	public function handle_disconnect() {
		$this->guard();

		$api_url = Saas_Connector_Settings::get( 'api_url' );
		$api_key = Saas_Connector_Settings::get( 'api_key' );

		if ( '' !== $api_url && '' !== $api_key ) {
			Saas_Connector_Api_Client::disconnect( $api_url, $api_key );
		}

		// Always clear local credentials so a stale key never lingers.
		Saas_Connector_Settings::clear_credentials();
		$this->redirect_with_notice( 'success', __( 'Store disconnected.', 'saas-connector' ) );
	}

	/**
	 * Shared capability + nonce guard for admin-post handlers.
	 */
	private function guard() {
		if ( ! current_user_can( self::CAPABILITY ) ) {
			wp_die( esc_html__( 'You do not have permission to perform this action.', 'saas-connector' ) );
		}
		check_admin_referer( self::NONCE );
	}

	/**
	 * Persist a one-shot admin notice and redirect back to the settings page.
	 *
	 * @param string $type    'success' | 'error'.
	 * @param string $message Message to display.
	 */
	private function redirect_with_notice( $type, $message ) {
		set_transient(
			$this->notice_key(),
			array(
				'type'    => ( 'success' === $type ) ? 'success' : 'error',
				'message' => $message,
			),
			60
		);
		wp_safe_redirect( admin_url( 'admin.php?page=' . self::PAGE_SLUG ) );
		exit;
	}

	/**
	 * Render and clear any pending admin notice.
	 */
	private function render_notice() {
		$notice = get_transient( $this->notice_key() );
		if ( ! is_array( $notice ) || empty( $notice['message'] ) ) {
			return;
		}
		delete_transient( $this->notice_key() );

		$class = ( 'success' === $notice['type'] ) ? 'notice-success' : 'notice-error';
		printf(
			'<div class="notice %1$s is-dismissible"><p>%2$s</p></div>',
			esc_attr( $class ),
			esc_html( $notice['message'] )
		);
	}

	/**
	 * Per-user transient key so notices are not shown to other admins.
	 *
	 * @return string
	 */
	private function notice_key() {
		return 'saas_connector_notice_' . get_current_user_id();
	}

	/**
	 * Current time formatted in the site's timezone.
	 *
	 * @return string
	 */
	private function now() {
		return wp_date( 'Y-m-d H:i:s' );
	}

	/**
	 * Human-readable label for a connection status.
	 *
	 * @param string $status Raw status.
	 * @return string
	 */
	private function status_label( $status ) {
		switch ( $status ) {
			case 'connected':
				return __( 'Connected', 'saas-connector' );
			case 'pending':
				return __( 'Pending', 'saas-connector' );
			default:
				return __( 'Disconnected', 'saas-connector' );
		}
	}
}
