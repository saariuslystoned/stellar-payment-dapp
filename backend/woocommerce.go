package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

// WooCommerce REST API client
type WCClient struct {
	BaseURL       string
	ConsumerKey   string
	ConsumerSecret string
	HTTPClient    *http.Client
}

// Order meta data
type OrderMeta struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// Order update payload
type OrderUpdate struct {
	Status   string      `json:"status,omitempty"`
	MetaData []OrderMeta `json:"meta_data,omitempty"`
}

// NewWCClient creates a WooCommerce API client from environment
func NewWCClient() *WCClient {
	return &WCClient{
		BaseURL:        os.Getenv("WC_BASE_URL"),        // e.g., https://yoursite.com
		ConsumerKey:    os.Getenv("WC_CONSUMER_KEY"),    // WC API key
		ConsumerSecret: os.Getenv("WC_CONSUMER_SECRET"), // WC API secret
		HTTPClient:     &http.Client{},
	}
}

// basicAuth returns the auth header value
func (c *WCClient) basicAuth() string {
	auth := c.ConsumerKey + ":" + c.ConsumerSecret
	return "Basic " + base64.StdEncoding.EncodeToString([]byte(auth))
}

// UpdateOrderMeta adds escrow metadata to an order
func (c *WCClient) UpdateOrderMeta(orderID int, escrowID string, buyerAddress string) error {
	url := fmt.Sprintf("%s/wp-json/wc/v3/orders/%d", c.BaseURL, orderID)

	update := OrderUpdate{
		MetaData: []OrderMeta{
			{Key: "_stellar_escrow_id", Value: escrowID},
			{Key: "_stellar_buyer_address", Value: buyerAddress},
		},
	}

	body, err := json.Marshal(update)
	if err != nil {
		return fmt.Errorf("marshal error: %w", err)
	}

	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("request error: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", c.basicAuth())

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("http error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("WC API error %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

// UpdateOrderStatus updates the order status
func (c *WCClient) UpdateOrderStatus(orderID int, status string, txHash string) error {
	url := fmt.Sprintf("%s/wp-json/wc/v3/orders/%d", c.BaseURL, orderID)

	update := OrderUpdate{
		Status: status,
		MetaData: []OrderMeta{
			{Key: "_stellar_tx_hash", Value: txHash},
		},
	}

	body, err := json.Marshal(update)
	if err != nil {
		return fmt.Errorf("marshal error: %w", err)
	}

	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("request error: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", c.basicAuth())

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("http error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("WC API error %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

// AddOrderNote creates a visible order note (shows in Order Notes section)
func (c *WCClient) AddOrderNote(orderID int, note string) error {
	url := fmt.Sprintf("%s/wp-json/wc/v3/orders/%d/notes", c.BaseURL, orderID)

	payload := map[string]interface{}{
		"note":          note,
		"customer_note": false, // Admin note, not sent to customer
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal error: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("request error: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", c.basicAuth())

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("http error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("WC API error %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

// GetOrder fetches a single order by ID from WooCommerce
func (c *WCClient) GetOrder(orderID int) (*OrderPayload, error) {
	url := fmt.Sprintf("%s/wp-json/wc/v3/orders/%d", c.BaseURL, orderID)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("request error: %w", err)
	}
	req.Header.Set("Authorization", c.basicAuth())

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("WC API error %d: %s", resp.StatusCode, string(respBody))
	}

	var order OrderPayload
	if err := json.NewDecoder(resp.Body).Decode(&order); err != nil {
		return nil, fmt.Errorf("decode error: %w", err)
	}

	return &order, nil
}

// GetOrderByEscrowID finds an order by stellar escrow ID
func (c *WCClient) GetOrderByEscrowID(escrowID string) (*OrderPayload, error) {
	// WC doesn't support meta query directly, so we query pending orders
	// and filter client-side (or use a custom endpoint plugin)
	url := fmt.Sprintf("%s/wp-json/wc/v3/orders?status=pending&per_page=50", c.BaseURL)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", c.basicAuth())

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var orders []OrderPayload
	if err := json.NewDecoder(resp.Body).Decode(&orders); err != nil {
		return nil, err
	}

	// Find order with matching escrow ID in meta
	for _, o := range orders {
		for _, m := range o.MetaData {
			if m.Key == "_stellar_escrow_id" && m.Value == escrowID {
				return &o, nil
			}
		}
	}

	return nil, fmt.Errorf("order not found for escrow %s", escrowID)
}
