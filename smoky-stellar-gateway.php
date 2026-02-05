<?php
/**
 * Plugin Name: Smoky Stellar Payment Gateway
 * Plugin URI: https://github.com/bobbybones/stellar-payment-dapp
 * Description: Custom WooCommerce Payment Gateway for Smoky Coins with Stellar DApp checkout, ZMOKE rewards enrollment, and store credit system.
 * Version: 2.0.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: Smoky Coins
 * Author URI: https://smokyproduct.co
 * License: GPL v2 or later
 * Text Domain: smoky-stellar
 * 
 * Changelog:
 * 2.0.0 - Added ZMOKE enrollment, store credit, secret key modal
 * 1.0.1 - Initial payment gateway with Order tracking
 */

define( 'SMOKY_STELLAR_VERSION', '2.0.0' );

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly
}

/**
 * Register custom role on plugin activation
 */
register_activation_hook( __FILE__, 'smoky_stellar_activate' );
function smoky_stellar_activate() {
    // Add 'stellar_customer' role with basic WooCommerce customer capabilities
    add_role( 'stellar_customer', 'Stellar Customer', array(
        'read'         => true,
        'edit_posts'   => false,
        'delete_posts' => false,
    ) );
}

/**
 * Clean up role on plugin deactivation (optional - commented out to preserve role)
 */
// register_deactivation_hook( __FILE__, 'smoky_stellar_deactivate' );
// function smoky_stellar_deactivate() {
//     remove_role( 'stellar_customer' );
// }

/**
 * Ensure role exists on init (for already-activated plugins)
 */
add_action( 'init', 'smoky_ensure_stellar_customer_role' );
function smoky_ensure_stellar_customer_role() {
    if ( ! get_role( 'stellar_customer' ) ) {
        add_role( 'stellar_customer', 'Stellar Customer', array(
            'read'         => true,
            'edit_posts'   => false,
            'delete_posts' => false,
        ) );
    }
}

/**
 * Custom REST API endpoint for updating user stellar data
 * This bypasses WooCommerce REST API limitations with custom roles and meta
 */
add_action( 'rest_api_init', 'smoky_register_stellar_endpoints' );
function smoky_register_stellar_endpoints() {
    register_rest_route( 'smoky-stellar/v1', '/user/(?P<user_id>\d+)', array(
        'methods'             => 'PUT',
        'callback'            => 'smoky_update_stellar_user',
        'permission_callback' => 'smoky_stellar_api_permission_check',
        'args'                => array(
            'user_id' => array(
                'required' => true,
                'type'     => 'integer',
            ),
            'public_key' => array(
                'required' => false,
                'type'     => 'string',
            ),
            'role' => array(
                'required' => false,
                'type'     => 'string',
            ),
        ),
    ) );
}

/**
 * Permission check - validate WooCommerce API keys via Basic Auth
 */
function smoky_stellar_api_permission_check( $request ) {
    // Check for WC REST API authentication
    if ( ! isset( $_SERVER['PHP_AUTH_USER'] ) || ! isset( $_SERVER['PHP_AUTH_PW'] ) ) {
        return new WP_Error( 'unauthorized', 'Missing authentication', array( 'status' => 401 ) );
    }
    
    $consumer_key = $_SERVER['PHP_AUTH_USER'];
    $consumer_secret = $_SERVER['PHP_AUTH_PW'];
    
    // Validate WC API key
    global $wpdb;
    $key = $wpdb->get_row(
        $wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}woocommerce_api_keys WHERE consumer_key = %s",
            wc_api_hash( $consumer_key )
        )
    );
    
    if ( ! $key || ! hash_equals( $key->consumer_secret, $consumer_secret ) ) {
        return new WP_Error( 'unauthorized', 'Invalid API credentials', array( 'status' => 401 ) );
    }
    
    // Check permissions (must be read_write)
    if ( $key->permissions !== 'read_write' ) {
        return new WP_Error( 'forbidden', 'Insufficient permissions', array( 'status' => 403 ) );
    }
    
    return true;
}

/**
 * Update user with stellar data
 */
function smoky_update_stellar_user( $request ) {
    $user_id = (int) $request['user_id'];
    $user = get_user_by( 'id', $user_id );
    
    if ( ! $user ) {
        return new WP_Error( 'not_found', 'User not found', array( 'status' => 404 ) );
    }
    
    $updated = array();
    
    // Update role if provided
    if ( isset( $request['role'] ) ) {
        $new_role = sanitize_text_field( $request['role'] );
        if ( get_role( $new_role ) ) {
            $user->set_role( $new_role );
            $updated['role'] = $new_role;
        }
    }
    
    // Update public key if provided
    if ( isset( $request['public_key'] ) ) {
        $public_key = sanitize_text_field( $request['public_key'] );
        update_user_meta( $user_id, '_stellar_public_key', $public_key );
        $updated['public_key'] = $public_key;
    }
    
    return array(
        'success' => true,
        'user_id' => $user_id,
        'updated' => $updated,
    );
}

/**
 * Display Stellar Wallet info on user profile in wp-admin
 */
add_action( 'show_user_profile', 'smoky_show_stellar_fields' );
add_action( 'edit_user_profile', 'smoky_show_stellar_fields' );
function smoky_show_stellar_fields( $user ) {
    $public_key = get_user_meta( $user->ID, '_stellar_public_key', true );
    ?>
    <h3>Stellar Wallet Information</h3>
    <table class="form-table">
        <tr>
            <th><label for="stellar_public_key">Stellar Public Key (G...)</label></th>
            <td>
                <?php if ( $public_key ) : ?>
                    <code style="font-size: 12px; background: #f0f0f1; padding: 8px 12px; display: inline-block; border-radius: 4px;">
                        <?php echo esc_html( $public_key ); ?>
                    </code>
                    <p class="description">This is the user's Stellar wallet address for ZMOKE rewards.</p>
                <?php else : ?>
                    <em style="color: #999;">No Stellar wallet linked yet.</em>
                    <p class="description">A wallet will be created when the user enrolls in ZMOKE rewards.</p>
                <?php endif; ?>
            </td>
        </tr>
    </table>
    <?php
}

/**
 * Show Stellar Public Key column in Users list
 */
add_filter( 'manage_users_columns', 'smoky_add_stellar_column' );
function smoky_add_stellar_column( $columns ) {
    $columns['stellar_wallet'] = 'Stellar Wallet';
    return $columns;
}

add_filter( 'manage_users_custom_column', 'smoky_show_stellar_column', 10, 3 );
function smoky_show_stellar_column( $value, $column_name, $user_id ) {
    if ( 'stellar_wallet' === $column_name ) {
        $public_key = get_user_meta( $user_id, '_stellar_public_key', true );
        if ( $public_key ) {
            return '<code style="font-size: 11px;">' . esc_html( substr( $public_key, 0, 8 ) ) . '...' . esc_html( substr( $public_key, -4 ) ) . '</code>';
        }
        return '<span style="color: #999;">—</span>';
    }
    return $value;
}

/**
 * Register the custom payment class once plugins are loaded.
 */
add_action( 'plugins_loaded', 'init_smoky_stellar_gateway', 11 );

function init_smoky_stellar_gateway() {

    // Ensure WooCommerce is active and the base class exists
    if ( ! class_exists( 'WC_Payment_Gateway' ) ) {
        return;
    }

    class WC_Gateway_Smoky_Stellar extends WC_Payment_Gateway {

        public function __construct() {
            $this->id                 = 'smoky_stellar';
            $this->icon               = ''; // Add URL to icon if desired
            $this->has_fields         = false;
            $this->method_title       = 'Stellar Payload (USDC/XLM)';
            $this->method_description = 'Pay securely using USDC or XLM on the Stellar Network.';
            
            // Supports standard product payments
            $this->supports           = array( 'products' );

            // Load the settings.
            $this->init_form_fields();
            $this->init_settings();

            // Define user set variables
            $this->title        = $this->get_option( 'title' );
            $this->description  = $this->get_option( 'description' );
            $this->enabled      = $this->get_option( 'enabled' );
            $this->checkout_url = $this->get_option( 'checkout_url', '/stellar-checkout/' ); 
            
            error_log( 'SmokyStellar: Constructor called. Enabled: ' . $this->enabled );

            // Save settings hook
            add_action( 'woocommerce_update_options_payment_gateways_' . $this->id, array( $this, 'process_admin_options' ) );
        }

        /**
         * Initialize Gateway Settings Form Fields
         */
        public function init_form_fields() {
            $this->form_fields = array(
                'enabled' => array(
                    'title'   => 'Enable/Disable',
                    'type'    => 'checkbox',
                    'label'   => 'Enable Stellar Payment',
                    'default' => 'yes'
                ),
                'title' => array(
                    'title'       => 'Title',
                    'type'        => 'text',
                    'description' => 'This controls the title which the user sees during checkout.',
                    'default'     => 'Stellar (USDC / XLM)',
                    'desc_tip'    => true,
                ),
                'description' => array(
                    'title'       => 'Description',
                    'type'        => 'textarea',
                    'description' => 'Payment method description that the customer will see on your checkout.',
                    'default'     => 'Pay securely using your Stellar wallet (Albedo/Freighter). You will be redirected to the secure payment portal.',
                ),
                'checkout_url' => array(
                    'title'       => 'Checkout Page URL',
                    'type'        => 'text',
                    'description' => 'The path to the WordPress page hosting the DApp frontend (e.g., /stellar-checkout/).',
                    'default'     => '/stellar-checkout/',
                ),
                'backend_url' => array(
                    'title'       => 'Backend API URL',
                    'type'        => 'text',
                    'description' => 'The URL of your Smoky backend service (e.g., https://smoky-backend.ngrok.app).',
                    'default'     => 'https://smoky-backend.ngrok.app',
                )
            );
        }

        /**
         * Check if the gateway is available for use.
         * Explicit override to ensure it shows up if enabled.
         */
        public function is_available() {
            $is_avail = ( 'yes' === $this->enabled );
            
            if ( ! $is_avail ) {
                 error_log( 'SmokyStellar: is_available returning FALSE because enabled is ' . $this->enabled );
            }
            // By default, assume available if enabled. 
            // Only return false here if specific conditions fail (like currency mismatch, but we support all).
            return $is_avail;
        }

        /**
         * Process the payment and return the result
         */
        public function process_payment( $order_id ) {
            $order = wc_get_order( $order_id );

            // Mark as 'pending' (waiting for payment)
            $order->update_status( 'pending', __( 'Awaiting Stellar payment.', 'wc-gateway-offline' ) );

            // Reduce stock levels
            wc_reduce_stock_levels( $order_id );

            // Remove cart
            WC()->cart->empty_cart();

            // Redirect to the Custom Checkout Page with Order ID and Amount
            $redirect_url = add_query_arg(
                array(
                    'order_id' => $order_id,
                    'amount'   => $order->get_total(),
                ),
                site_url( $this->checkout_url )
            );

            return array(
                'result'   => 'success',
                'redirect' => $redirect_url,
            );
        }
    }
}

/**
 * Add the Gateway to WooCommerce
 */
function add_smoky_stellar_gateway( $methods ) {
    $methods[] = 'WC_Gateway_Smoky_Stellar'; 
    return $methods;
}
add_filter( 'woocommerce_payment_gateways', 'add_smoky_stellar_gateway' );

/**
 * ============================================================
 * ADMIN PANEL: Stellar Payments Dashboard
 * ============================================================
 */

/**
 * Register admin menu under WooCommerce
 */
add_action( 'admin_menu', 'smoky_stellar_admin_menu' );

function smoky_stellar_admin_menu() {
    add_submenu_page(
        'woocommerce',
        'Stellar Payments',
        'Stellar Payments',
        'manage_woocommerce',
        'stellar-payments',
        'smoky_stellar_admin_page'
    );
}

/**
 * Admin page renderer
 */
function smoky_stellar_admin_page() {
    // Query all orders using Stellar payment method
    $args = array(
        'payment_method' => 'smoky_stellar',
        'limit'          => 100,
        'orderby'        => 'date',
        'order'          => 'DESC',
    );
    
    $orders = wc_get_orders( $args );
    
    ?>
    <div class="wrap">
        <h1>🚀 Stellar Payments Dashboard</h1>
        <p>All transactions processed through the Smoky Stellar Payment Gateway.</p>
        
        <?php if ( empty( $orders ) ) : ?>
            <div class="notice notice-info">
                <p>No Stellar payments found yet.</p>
            </div>
        <?php else : ?>
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th style="width:70px;">Order #</th>
                        <th style="width:120px;">Date</th>
                        <th style="width:90px;">Status</th>
                        <th style="width:80px;">Amount</th>
                        <th style="width:180px;">Buyer Wallet</th>
                        <th style="width:100px;">Payment TX</th>
                        <th style="width:100px;">Escrow</th>
                        <th style="width:90px;">ZMOKE</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ( $orders as $order ) : 
                        $order_id    = $order->get_id();
                        $date        = $order->get_date_created()->date( 'M j, Y g:ia' );
                        $status      = $order->get_status();
                        $total       = $order->get_formatted_order_total();
                        $buyer_addr  = $order->get_meta( '_stellar_buyer_address' );
                        $tx_hash     = $order->get_meta( '_stellar_tx_hash' );
                        $escrow_id   = $order->get_meta( '_stellar_escrow_id' );
                        
                        // Parse ZMOKE and escrow status from order notes
                        $notes_data  = smoky_parse_order_notes( $order_id );
                        $zmoke_amt   = $notes_data['zmoke_amount'];
                        $escrow_stat = $notes_data['escrow_released'] ? '✅ Released' : ( $escrow_id ? '⏳ Pending' : '—' );
                        
                        // Shorten wallet for display
                        $wallet_short = $buyer_addr ? substr( $buyer_addr, 0, 8 ) . '...' . substr( $buyer_addr, -4 ) : '—';
                        
                        // Status badge colors
                        $status_colors = array(
                            'processing' => '#2271b1',
                            'completed'  => '#00a32a',
                            'pending'    => '#dba617',
                            'failed'     => '#d63638',
                            'cancelled'  => '#787c82',
                        );
                        $status_color = isset( $status_colors[ $status ] ) ? $status_colors[ $status ] : '#787c82';
                    ?>
                    <tr>
                        <td>
                            <a href="<?php echo admin_url( 'post.php?post=' . $order_id . '&action=edit' ); ?>">
                                <strong>#<?php echo $order_id; ?></strong>
                            </a>
                        </td>
                        <td><?php echo esc_html( $date ); ?></td>
                        <td>
                            <span style="background:<?php echo $status_color; ?>; color:#fff; padding:2px 8px; border-radius:3px; font-size:11px;">
                                <?php echo esc_html( ucfirst( $status ) ); ?>
                            </span>
                        </td>
                        <td><?php echo $total; ?></td>
                        <td title="<?php echo esc_attr( $buyer_addr ); ?>">
                            <?php if ( $buyer_addr ) : ?>
                                <code style="font-size:11px;"><?php echo esc_html( $wallet_short ); ?></code>
                            <?php else : ?>
                                —
                            <?php endif; ?>
                        </td>
                        <td>
                            <?php if ( $tx_hash ) : ?>
                                <a href="https://stellar.expert/explorer/testnet/tx/<?php echo esc_attr( $tx_hash ); ?>" target="_blank" style="font-size:11px;">
                                    View TX ↗
                                </a>
                            <?php else : ?>
                                —
                            <?php endif; ?>
                        </td>
                        <td>
                            <?php echo esc_html( $escrow_stat ); ?>
                        </td>
                        <td>
                            <?php if ( $zmoke_amt > 0 ) : ?>
                                <span style="color:#00a32a; font-weight:bold;">🪙 <?php echo $zmoke_amt; ?></span>
                            <?php else : ?>
                                —
                            <?php endif; ?>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            
            <p style="margin-top:15px; color:#666;">
                Showing <?php echo count( $orders ); ?> orders. 
                <a href="https://stellar.expert/explorer/testnet" target="_blank">Open Stellar Explorer ↗</a>
            </p>
        <?php endif; ?>
    </div>
    <?php
}

/**
 * Parse order notes for ZMOKE amount and escrow status
 */
function smoky_parse_order_notes( $order_id ) {
    $result = array(
        'zmoke_amount'    => 0,
        'escrow_released' => false,
        'zmoke_tx'        => '',
        'release_tx'      => '',
    );
    
    $notes = wc_get_order_notes( array( 'order_id' => $order_id ) );
    
    foreach ( $notes as $note ) {
        $content = $note->content;
        
        // Check for ZMOKE distribution
        if ( preg_match( '/Rewarded buyer with (\d+) ZMOKE/', $content, $matches ) ) {
            $result['zmoke_amount'] = intval( $matches[1] );
        }
        
        // Check for escrow release
        if ( strpos( $content, 'Escrow released' ) !== false ) {
            $result['escrow_released'] = true;
        }
    }
    
    return $result;
}

// ============================================================================
// ZMOKE REWARDS ENROLLMENT SYSTEM
// ============================================================================

/**
 * Get backend URL from gateway settings (or fallback to wp-config or default)
 */
function smoky_get_backend_url() {
    // First check gateway settings
    $gateways = WC()->payment_gateways()->get_available_payment_gateways();
    if ( isset( $gateways['smoky_stellar'] ) ) {
        $url = $gateways['smoky_stellar']->get_option( 'backend_url' );
        if ( ! empty( $url ) ) {
            return rtrim( $url, '/' );
        }
    }
    // Fallback to constant or default
    if ( defined( 'SMOKY_BACKEND_URL' ) ) {
        return rtrim( SMOKY_BACKEND_URL, '/' );
    }
    return 'https://smoky-backend.ngrok.app';
}

/**
 * Display enrollment checkbox before "Place Order" button
 */
add_action( 'woocommerce_review_order_before_submit', 'smoky_display_zmoke_enrollment_checkbox', 10 );
function smoky_display_zmoke_enrollment_checkbox() {
    $user_id = get_current_user_id();
    if ( $user_id && get_user_meta( $user_id, '_stellar_public_key', true ) ) {
        return; // Already enrolled
    }
    ?>
    <div id="smoky-enrollment-field" style="
        margin: 20px 0; padding: 16px;
        background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
        border-radius: 12px; border: 1px solid #4c1d95;
    ">
        <label style="display: flex; align-items: flex-start; gap: 12px; cursor: pointer; color: #e0e7ff;">
            <input type="checkbox" name="smoky_enroll_zmoke" id="smoky_enroll_zmoke" value="1"
                style="width: 20px; height: 20px; margin-top: 2px; accent-color: #8b5cf6;" />
            <span style="flex: 1;">
                <strong style="display: block; font-size: 14px; margin-bottom: 4px;">
                    🪙 Enroll in ZMOKE Rewards
                </strong>
                <span style="font-size: 12px; color: #a5b4fc; line-height: 1.4;">
                    Create a free Stellar wallet and earn <strong>10 ZMOKE per $1 spent</strong>. 
                    A one-time <strong>$0.25 activation fee</strong> covers wallet setup.
                </span>
            </span>
        </label>
    </div>
    <script>
    jQuery(function($) {
        $('#smoky_enroll_zmoke').on('change', function() {
            $('body').trigger('update_checkout');
        });
    });
    </script>
    <?php
}

/**
 * Add $0.25 fee when enrollment checkbox is checked
 */
add_action( 'woocommerce_cart_calculate_fees', 'smoky_add_enrollment_fee', 20 );
function smoky_add_enrollment_fee( $cart ) {
    if ( is_admin() && ! defined( 'DOING_AJAX' ) ) return;
    
    $enroll_requested = false;
    if ( isset( $_POST['post_data'] ) ) {
        parse_str( $_POST['post_data'], $post_data );
        $enroll_requested = isset( $post_data['smoky_enroll_zmoke'] ) && $post_data['smoky_enroll_zmoke'] == '1';
    }
    if ( isset( $_POST['smoky_enroll_zmoke'] ) && $_POST['smoky_enroll_zmoke'] == '1' ) {
        $enroll_requested = true;
    }
    
    if ( $enroll_requested ) {
        $cart->add_fee( __( 'Wallet Activation Fee', 'smoky-stellar' ), 0.25, true );
    }
}

/**
 * Save enrollment preference to order meta
 */
add_action( 'woocommerce_checkout_create_order', 'smoky_save_enrollment_preference', 10, 2 );
function smoky_save_enrollment_preference( $order, $data ) {
    if ( isset( $_POST['smoky_enroll_zmoke'] ) && $_POST['smoky_enroll_zmoke'] == '1' ) {
        $order->update_meta_data( '_smoky_zmoke_enrollment_requested', 'yes' );
    }
}

/**
 * Trigger wallet creation on Thank You page
 */
add_action( 'woocommerce_thankyou', 'smoky_trigger_wallet_enrollment', 5, 1 );
function smoky_trigger_wallet_enrollment( $order_id ) {
    $order = wc_get_order( $order_id );
    if ( ! $order ) return;
    
    if ( $order->get_meta( '_smoky_zmoke_enrollment_requested' ) !== 'yes' ) return;
    if ( $order->get_meta( '_smoky_wallet_created' ) === 'yes' ) return;
    
    $user_id = $order->get_user_id();
    if ( ! $user_id ) return;
    
    $response = wp_remote_post( smoky_get_backend_url() . '/api/enroll-user', array(
        'headers' => array( 'Content-Type' => 'application/json' ),
        'body' => wp_json_encode( array( 'user_id' => $user_id ) ),
        'timeout' => 30,
    ) );
    
    if ( is_wp_error( $response ) ) {
        error_log( 'SmokyStellar Enrollment Error: ' . $response->get_error_message() );
        return;
    }
    
    $body = json_decode( wp_remote_retrieve_body( $response ), true );
    
    if ( isset( $body['public_key'] ) && isset( $body['secret_key'] ) ) {
        update_user_meta( $user_id, '_stellar_public_key', sanitize_text_field( $body['public_key'] ) );
        
        $order->update_meta_data( '_smoky_wallet_created', 'yes' );
        $order->update_meta_data( '_stellar_public_key', sanitize_text_field( $body['public_key'] ) );
        $order->save();
        
        $order->add_order_note( sprintf(
            '🔑 ZMOKE Wallet created! Key: %s...%s',
            substr( $body['public_key'], 0, 8 ), substr( $body['public_key'], -4 )
        ) );
        
        smoky_display_secret_key_modal( $body['public_key'], $body['secret_key'] );
    }
}

/**
 * Render Secret Key Modal (one-time display)
 */
function smoky_display_secret_key_modal( $public_key, $secret_key ) {
    ?>
    <div id="smoky-secret-modal" style="
        position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:999999;
        display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px);
    ">
        <div style="max-width:480px; width:90%; background:linear-gradient(180deg,#1e1b4b,#0f0a1e);
            border-radius:16px; padding:32px; border:1px solid #4c1d95;">
            <div style="text-align:center; margin-bottom:24px;">
                <div style="width:64px; height:64px; background:linear-gradient(135deg,#8b5cf6,#ec4899);
                    border-radius:50%; display:flex; align-items:center; justify-content:center;
                    margin:0 auto 16px; font-size:28px;">🔑</div>
                <h2 style="color:#f8fafc; font-size:24px; margin:0 0 8px;">Your Stellar Wallet</h2>
                <p style="color:#94a3b8; font-size:14px; margin:0;">
                    Save your secret key. <strong style="color:#f87171;">You will only see this once.</strong>
                </p>
            </div>
            
            <div style="margin-bottom:16px;">
                <label style="display:block; color:#a5b4fc; font-size:12px; text-transform:uppercase; margin-bottom:6px;">
                    Public Address
                </label>
                <div style="background:#0f172a; border:1px solid #334155; border-radius:8px; padding:12px;
                    font-family:monospace; font-size:11px; color:#22c55e; word-break:break-all;">
                    <?php echo esc_html( $public_key ); ?>
                </div>
            </div>
            
            <div style="margin-bottom:24px;">
                <label style="display:block; color:#fbbf24; font-size:12px; text-transform:uppercase; margin-bottom:6px;">
                    ⚠️ Secret Key (Save This!)
                </label>
                <div id="smoky-secret-display" style="background:linear-gradient(135deg,#7f1d1d,#450a0a);
                    border:1px solid #dc2626; border-radius:8px; padding:12px;
                    font-family:monospace; font-size:11px; color:#fef2f2; word-break:break-all;">
                    <?php echo esc_html( $secret_key ); ?>
                </div>
                <button id="smoky-copy-btn" onclick="smokyModal.copy()" style="
                    width:100%; margin-top:8px; padding:12px;
                    background:linear-gradient(135deg,#4c1d95,#7c3aed);
                    border:none; border-radius:8px; color:white; font-weight:bold; cursor:pointer;">
                    📋 Copy Secret Key
                </button>
            </div>
            
            <div style="background:#7f1d1d20; border:1px dashed #dc2626; border-radius:8px; padding:12px; margin-bottom:20px;">
                <p style="color:#fca5a5; font-size:12px; margin:0; line-height:1.5;">
                    <strong>⚠️ IMPORTANT:</strong> This key controls your wallet. Store it securely. We cannot recover it.
                </p>
            </div>
            
            <label style="display:flex; align-items:flex-start; gap:10px; color:#e2e8f0; font-size:13px; cursor:pointer; margin-bottom:16px;">
                <input type="checkbox" id="smoky-confirm" style="width:18px; height:18px; margin-top:2px; accent-color:#8b5cf6;" />
                <span>I have securely saved my secret key.</span>
            </label>
            
            <button id="smoky-close-btn" onclick="smokyModal.close()" disabled style="
                width:100%; padding:14px; background:#334155; border:none; border-radius:8px;
                color:#94a3b8; font-weight:bold; cursor:not-allowed;">
                Continue to Order
            </button>
        </div>
    </div>
    <script>
    window.smokyModal = {
        key: '<?php echo esc_js( $secret_key ); ?>',
        copy: function() {
            navigator.clipboard.writeText(this.key).then(function() {
                var btn = document.getElementById('smoky-copy-btn');
                btn.textContent = '✅ Copied!';
                btn.style.background = 'linear-gradient(135deg,#065f46,#10b981)';
                setTimeout(function() {
                    btn.textContent = '📋 Copy Secret Key';
                    btn.style.background = 'linear-gradient(135deg,#4c1d95,#7c3aed)';
                }, 2000);
            });
        },
        close: function() { document.getElementById('smoky-secret-modal').style.display = 'none'; }
    };
    document.getElementById('smoky-confirm').onchange = function() {
        var btn = document.getElementById('smoky-close-btn');
        if (this.checked) {
            btn.disabled = false;
            btn.style.background = 'linear-gradient(135deg,#059669,#10b981)';
            btn.style.color = 'white';
            btn.style.cursor = 'pointer';
        } else {
            btn.disabled = true;
            btn.style.background = '#334155';
            btn.style.color = '#94a3b8';
            btn.style.cursor = 'not-allowed';
        }
    };
    </script>
    <?php
}

// ============================================================================
// STORE CREDIT SYSTEM
// ============================================================================

/**
 * Display Store Credit toggle at checkout
 */
add_action( 'woocommerce_review_order_before_payment', 'smoky_display_store_credit_toggle', 10 );
function smoky_display_store_credit_toggle() {
    $user_id = get_current_user_id();
    if ( ! $user_id ) return;
    
    $credit = floatval( get_user_meta( $user_id, '_zmoke_store_credit', true ) );
    if ( $credit <= 0 ) return;
    
    $cart_total = WC()->cart->get_total( 'edit' );
    $applicable = min( $credit, $cart_total );
    ?>
    <div style="margin:20px 0; padding:16px; background:linear-gradient(135deg,#064e3b,#065f46);
        border-radius:12px; border:1px solid #10b981;">
        <label style="display:flex; align-items:flex-start; gap:12px; cursor:pointer; color:#d1fae5;">
            <input type="checkbox" name="smoky_apply_store_credit" id="smoky_apply_credit" value="1" checked
                style="width:20px; height:20px; margin-top:2px; accent-color:#10b981;" />
            <span style="flex:1;">
                <strong style="display:block; font-size:14px; margin-bottom:4px;">💰 Apply Store Credit</strong>
                <span style="font-size:12px; color:#a7f3d0;">
                    You have <strong>$<?php echo number_format( $credit, 2 ); ?></strong> credit.
                    <?php if ( $applicable < $credit ) : ?>
                        Applying <strong>$<?php echo number_format( $applicable, 2 ); ?></strong>.
                    <?php endif; ?>
                </span>
            </span>
        </label>
    </div>
    <script>
    jQuery(function($) {
        $('#smoky_apply_credit').on('change', function() { $('body').trigger('update_checkout'); });
    });
    </script>
    <?php
}

/**
 * Apply store credit as negative fee
 */
add_action( 'woocommerce_cart_calculate_fees', 'smoky_apply_store_credit_discount', 25 );
function smoky_apply_store_credit_discount( $cart ) {
    if ( is_admin() && ! defined( 'DOING_AJAX' ) ) return;
    
    $user_id = get_current_user_id();
    if ( ! $user_id ) return;
    
    $apply = true;
    if ( isset( $_POST['post_data'] ) ) {
        parse_str( $_POST['post_data'], $pd );
        $apply = ! isset( $pd['smoky_apply_store_credit'] ) || $pd['smoky_apply_store_credit'] == '1';
    }
    if ( isset( $_POST['smoky_apply_store_credit'] ) && $_POST['smoky_apply_store_credit'] != '1' ) {
        $apply = false;
    }
    if ( ! $apply ) return;
    
    $credit = floatval( get_user_meta( $user_id, '_zmoke_store_credit', true ) );
    if ( $credit <= 0 ) return;
    
    $subtotal = $cart->get_subtotal() + $cart->get_fee_total();
    $to_apply = min( $credit, $subtotal );
    
    if ( $to_apply > 0 ) {
        $cart->add_fee( __( 'Store Credit (ZMOKE)', 'smoky-stellar' ), -$to_apply, false );
    }
}

/**
 * Deduct used credit upon payment
 */
add_action( 'woocommerce_payment_complete', 'smoky_deduct_store_credit', 10, 1 );
add_action( 'woocommerce_order_status_processing', 'smoky_deduct_store_credit', 10, 1 );
function smoky_deduct_store_credit( $order_id ) {
    $order = wc_get_order( $order_id );
    if ( ! $order || $order->get_meta( '_smoky_credit_deducted' ) === 'yes' ) return;
    
    $user_id = $order->get_user_id();
    if ( ! $user_id ) return;
    
    $used = 0;
    foreach ( $order->get_fees() as $fee ) {
        if ( strpos( $fee->get_name(), 'Store Credit' ) !== false ) {
            $used = abs( floatval( $fee->get_total() ) );
            break;
        }
    }
    if ( $used <= 0 ) return;
    
    $current = floatval( get_user_meta( $user_id, '_zmoke_store_credit', true ) );
    $new_balance = max( 0, $current - $used );
    update_user_meta( $user_id, '_zmoke_store_credit', $new_balance );
    
    $order->update_meta_data( '_smoky_credit_used', $used );
    $order->update_meta_data( '_smoky_credit_remaining', $new_balance );
    $order->update_meta_data( '_smoky_credit_deducted', 'yes' );
    $order->save();
    
    $order->add_order_note( sprintf( '💰 Store Credit: -$%.2f (Remaining: $%.2f)', $used, $new_balance ) );
}

// ============================================================================
// MY ACCOUNT INTEGRATION
// ============================================================================

/**
 * Display ZMOKE wallet info on account dashboard
 */
add_action( 'woocommerce_account_dashboard', 'smoky_display_zmoke_on_account', 5 );
function smoky_display_zmoke_on_account() {
    $user_id = get_current_user_id();
    $credit = floatval( get_user_meta( $user_id, '_zmoke_store_credit', true ) );
    $pubkey = get_user_meta( $user_id, '_stellar_public_key', true );
    
    if ( ! $credit && ! $pubkey ) return;
    
    // Fetch ZMOKE balance from Horizon if we have a pubkey
    $zmoke_balance = 0;
    if ( $pubkey ) {
        $zmoke_balance = smoky_get_zmoke_balance( $pubkey );
    }
    ?>
    <div style="margin:20px 0; padding:20px; background:linear-gradient(135deg,#1e1b4b,#312e81);
        border-radius:12px; border:1px solid #4c1d95; color:white;">
        <h3 style="margin:0 0 12px; font-size:18px;">🪙 ZMOKE Wallet</h3>
        <?php if ( $pubkey ) : ?>
        <p style="margin:0 0 8px; font-size:13px; color:#a5b4fc;">
            <strong>Stellar Address:</strong>
            <code style="font-size:11px; background:#0f172a; padding:4px 8px; border-radius:4px; display:block; margin-top:4px; word-break:break-all;">
                <?php echo esc_html( $pubkey ); ?>
            </code>
        </p>
        <?php endif; ?>
        
        <?php if ( $zmoke_balance > 0 ) : ?>
        <p style="margin:12px 0 0; font-size:15px;">
            <strong>ZMOKE Balance:</strong>
            <span style="background:linear-gradient(135deg,#f59e0b,#d97706); padding:4px 12px; border-radius:20px; margin-left:8px; font-weight:bold;">
                <?php echo number_format( $zmoke_balance, 2 ); ?> ZMOKE
            </span>
        </p>
        <?php endif; ?>
        
        <?php if ( $credit > 0 ) : ?>
        <p style="margin:12px 0 0; font-size:15px;">
            <strong>Store Credit:</strong>
            <span style="background:linear-gradient(135deg,#059669,#10b981); padding:4px 12px; border-radius:20px; margin-left:8px; font-weight:bold;">
                $<?php echo number_format( $credit, 2 ); ?>
            </span>
        </p>
        <?php endif; ?>
    </div>
    <?php
}

/**
 * Fetch ZMOKE balance from Stellar Horizon
 */
function smoky_get_zmoke_balance( $pubkey ) {
    // ZMOKE issuer - testnet
    $zmoke_issuer = 'GBLP7D5CFYOHDGYQB3AI673KV52P32Y3JYS6SDGLDL3K7MZXHMKSNRZL';
    
    $horizon_url = 'https://horizon-testnet.stellar.org/accounts/' . urlencode( $pubkey );
    
    $response = wp_remote_get( $horizon_url, array( 'timeout' => 5 ) );
    
    if ( is_wp_error( $response ) ) {
        return 0;
    }
    
    $body = wp_remote_retrieve_body( $response );
    $data = json_decode( $body, true );
    
    if ( ! isset( $data['balances'] ) || ! is_array( $data['balances'] ) ) {
        return 0;
    }
    
    foreach ( $data['balances'] as $balance ) {
        if ( isset( $balance['asset_code'] ) && $balance['asset_code'] === 'ZMOKE' 
             && isset( $balance['asset_issuer'] ) && $balance['asset_issuer'] === $zmoke_issuer ) {
            return floatval( $balance['balance'] );
        }
    }
    
    return 0;
}

/**
 * Admin order view - show credit info
 */
add_action( 'woocommerce_admin_order_data_after_billing_address', 'smoky_display_credit_in_admin', 10, 1 );
function smoky_display_credit_in_admin( $order ) {
    $used = $order->get_meta( '_smoky_credit_used' );
    if ( $used ) {
        echo '<p><strong>ZMOKE Credit Used:</strong> $' . number_format( floatval( $used ), 2 ) . '</p>';
        $rem = $order->get_meta( '_smoky_credit_remaining' );
        if ( $rem !== '' ) {
            echo '<p><strong>Balance After:</strong> $' . number_format( floatval( $rem ), 2 ) . '</p>';
        }
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/** Add store credit to a user */
function smoky_add_store_credit( $user_id, $amount ) {
    $current = floatval( get_user_meta( $user_id, '_zmoke_store_credit', true ) );
    update_user_meta( $user_id, '_zmoke_store_credit', $current + floatval( $amount ) );
    return $current + floatval( $amount );
}

/** Get user's store credit balance */
function smoky_get_store_credit( $user_id ) {
    return floatval( get_user_meta( $user_id, '_zmoke_store_credit', true ) );
}

/** Get user's Stellar public key */
function smoky_get_stellar_address( $user_id ) {
    return get_user_meta( $user_id, '_stellar_public_key', true );
}
