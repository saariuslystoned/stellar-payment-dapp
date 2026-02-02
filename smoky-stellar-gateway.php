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
