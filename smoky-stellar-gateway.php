<?php
/**
 * Plugin Name: Smoky Stellar Payment Gateway
 * Description: Custom WooCommerce Payment Gateway for Smoky Coins that redirects to a Stellar DApp checkout.
 * Version: 1.0.1
 * Author: Smoky Coins
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly
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
