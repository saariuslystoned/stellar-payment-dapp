package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/stellar/go/clients/horizonclient"
	"github.com/stellar/go/keypair"
)

// Config
const (
	Port            = ":8080"
	PaymentEscrowID = "CDLLYK6JTLNNDEW3RGH2FNKKFLQLPSV64CGDFZK3WDH5M6QIFIMWAHIB" // payment_escrow contract
	ZmokeMinterID   = ""                                                         // TODO: Deploy and set ZMOKE minter contract ID
)

// PendingOrder tracks orders awaiting escrow deposit
type PendingOrder struct {
	OrderID      int
	Total        float64
	BuyerAddress string
	EscrowID     string
	CreatedAt    time.Time
}

// Global state
var (
	pendingOrders = make(map[int]*PendingOrder) // orderID -> pending order
	escrowToOrder = make(map[string]int)        // escrowID -> orderID
	mu            sync.RWMutex
	wcClient      *WCClient
	horizonClient *horizonclient.Client
)

// WooCommerce webhook payload
type OrderPayload struct {
	ID      int    `json:"id"`
	Status  string `json:"status"`
	Total   string `json:"total"`
	Billing struct {
		Email string `json:"email"`
	} `json:"billing"`
	MetaData []struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	} `json:"meta_data"`
}

// EscrowLinkRequest links an escrow to an order
type EscrowLinkRequest struct {
	OrderID      int    `json:"order_id"`
	EscrowID     string `json:"escrow_id"`
	BuyerAddress string `json:"buyer_address"`
	TxHash       string `json:"tx_hash"` // Added tx_hash to request
}

func main() {
	// Initialize clients
	horizonClient = horizonclient.DefaultTestNetClient
	wcClient = NewWCClient()

	// Endpoints (wrapped with CORS for frontend access)
	http.HandleFunc("/webhook/pending-order", handlePendingOrder)
	http.HandleFunc("/escrow/link", corsMiddleware(handleEscrowLink))
	http.HandleFunc("/health", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}))

	// Legacy endpoint for compatibility
	http.HandleFunc("/webhook/order-completed", handleOrderCompleted)

	// Price endpoint for live XLM/USD rates
	http.HandleFunc("/price/xlm", corsMiddleware(handlePriceXLM))

	// Start Horizon watcher in background
	go watchHorizonEvents()

	fmt.Printf("🚀 Smoky Coins Backend listening on %s\n", Port)
	fmt.Printf("   Escrow Contract: %s\n", PaymentEscrowID)
	log.Fatal(http.ListenAndServe(Port, nil))
}

// corsMiddleware adds CORS headers for browser requests
func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept, ngrok-skip-browser-warning")

		// Handle preflight
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

// handlePendingOrder receives WC webhook when order enters pending-payment
func handlePendingOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Dump debug info
	bodyBytes, _ := io.ReadAll(r.Body)
	log.Printf("📥 WEBHOOK RECEIVED:\n%s\n", string(bodyBytes))

	// Restore body for decoder
	r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

	// Check for WooCommerce Ping (webhook_id=...)
	if bytes.HasPrefix(bodyBytes, []byte("webhook_id=")) {
		log.Println("🔔 WooCommerce Ping received - configuration verified!")
		w.WriteHeader(http.StatusOK)
		return
	}

	var order OrderPayload
	if err := json.NewDecoder(r.Body).Decode(&order); err != nil {
		log.Printf("❌ JSON Decode Error: %v", err)
		http.Error(w, "Bad request: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Parse total
	// Handle case where Total might be empty or invalid
	totalVal := 0.0
	if order.Total != "" {
		if t, err := strconv.ParseFloat(order.Total, 64); err == nil {
			totalVal = t
		}
	}

	// Extract buyer's Stellar address from meta
	buyerAddr := ""
	for _, m := range order.MetaData {
		if m.Key == "stellar_public_key" || m.Key == "_stellar_buyer_address" {
			buyerAddr = m.Value
			break
		}
	}

	mu.Lock()
	pendingOrders[order.ID] = &PendingOrder{
		OrderID:      order.ID,
		Total:        totalVal,
		BuyerAddress: buyerAddr,
		CreatedAt:    time.Now(),
	}
	mu.Unlock()

	log.Printf("📦 Pending Order #%d: $%.2f for %s", order.ID, totalVal, buyerAddr)
	w.WriteHeader(http.StatusOK)
}

// handleEscrowLink links an escrow_id to a WC order (called after frontend deposit)
func handleEscrowLink(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req EscrowLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Get order total from pending orders (for ZMOKE calculation)
	var orderTotal float64
	mu.Lock()
	if po, exists := pendingOrders[req.OrderID]; exists {
		po.EscrowID = req.EscrowID
		po.BuyerAddress = req.BuyerAddress
		orderTotal = po.Total
		escrowToOrder[req.EscrowID] = req.OrderID
		log.Printf("📋 Found Order #%d in pending orders, total: $%.2f", req.OrderID, orderTotal)
	} else {
		log.Printf("📋 Order #%d not in pending orders, will fetch total from WooCommerce", req.OrderID)
	}
	mu.Unlock()

	// Fallback: If order total is 0, try to get it from WooCommerce
	if orderTotal == 0 {
		if wcOrder, err := wcClient.GetOrder(req.OrderID); err == nil && wcOrder != nil {
			if parsedTotal, parseErr := strconv.ParseFloat(wcOrder.Total, 64); parseErr == nil {
				orderTotal = parsedTotal
				log.Printf("📋 Fetched Order #%d total from WC: $%.2f", req.OrderID, orderTotal)
			}
		} else {
			log.Printf("⚠️ Could not fetch order total for #%d: %v", req.OrderID, err)
		}
	}

	// Update WC order meta AND status to processing
	// We do this immediately so the user sees "Processing" on their order screen
	if err := wcClient.UpdateOrderStatus(req.OrderID, "processing", req.TxHash); err != nil {
		log.Printf("⚠️ Failed to update WC order status: %v", err)
		http.Error(w, "Failed to update WooCommerce: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Also update meta for our own tracking (optional but good for history)
	wcClient.UpdateOrderMeta(req.OrderID, req.EscrowID, req.BuyerAddress)

	// Add visible order note with tx hash link (HTML anchor for clickability)
	txURL := fmt.Sprintf("https://stellar.expert/explorer/testnet/tx/%s", req.TxHash)
	txNote := fmt.Sprintf(`💫 Stellar payment confirmed! <a href="%s" target="_blank">View Transaction</a>`, txURL)
	if err := wcClient.AddOrderNote(req.OrderID, txNote); err != nil {
		log.Printf("⚠️ Failed to add order note: %v", err)
	}

	log.Printf("✅ Order #%d validated & updated to PROCESSING. Tx: %s", req.OrderID, req.TxHash)

	// === ESCROW RELEASE ===
	// Release escrow funds to seller now that payment is confirmed
	go func() {
		log.Printf("🔓 Releasing escrow %s for Order #%d...", req.EscrowID, req.OrderID)
		releaseTxHash, err := releaseEscrow(req.EscrowID)
		if err != nil {
			log.Printf("❌ Failed to release escrow: %v", err)
			wcClient.AddOrderNote(req.OrderID, fmt.Sprintf("⚠️ Escrow release failed: %v", err))
			return
		}
		log.Printf("✅ Escrow released: %s", releaseTxHash)

		// Add release note to order
		releaseURL := fmt.Sprintf("https://stellar.expert/explorer/testnet/tx/%s", releaseTxHash)
		releaseNote := fmt.Sprintf(`🔓 Escrow released to seller. <a href="%s" target="_blank">View Release TX</a>`, releaseURL)
		wcClient.AddOrderNote(req.OrderID, releaseNote)

		// === ZMOKE REWARDS ===
		// Distribute ZMOKE tokens to buyer ($1 = 10 ZMOKE)
		if req.BuyerAddress != "" && orderTotal > 0 {
			zmokeAmount := int64(orderTotal * 10)
			log.Printf("🪙 Distributing %d ZMOKE to %s...", zmokeAmount, req.BuyerAddress)

			if zmokeTxHash, err := distributeZmoke(req.BuyerAddress, zmokeAmount); err != nil {
				log.Printf("⚠️ Failed to distribute ZMOKE: %v", err)
				wcClient.AddOrderNote(req.OrderID, fmt.Sprintf("⚠️ ZMOKE distribution failed: %v", err))
			} else {
				log.Printf("✅ Distributed %d ZMOKE to %s", zmokeAmount, req.BuyerAddress)
				zmokeURL := fmt.Sprintf("https://stellar.expert/explorer/testnet/tx/%s", zmokeTxHash)
				zmokeNote := fmt.Sprintf(`🪙 Rewarded buyer with %d ZMOKE tokens! <a href="%s" target="_blank">View ZMOKE TX</a>`, zmokeAmount, zmokeURL)
				wcClient.AddOrderNote(req.OrderID, zmokeNote)
			}
		}

		// Clean up pending order
		mu.Lock()
		delete(pendingOrders, req.OrderID)
		delete(escrowToOrder, req.EscrowID)
		mu.Unlock()
	}()

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": "Order updated to processing, escrow release initiated",
	})
}

// watchHorizonEvents polls for deposit events on the escrow contract
func watchHorizonEvents() {
	log.Println("👀 Starting Horizon event watcher...")

	// Poll every 10 seconds for new contract events
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		mu.RLock()
		pendingCount := len(pendingOrders)
		mu.RUnlock()

		if pendingCount == 0 {
			continue
		}

		log.Printf("🔍 Checking %d pending orders for deposits...", pendingCount)

		// For each pending order with escrow ID, check if funded
		mu.Lock()
		for orderID, po := range pendingOrders {
			if po.EscrowID == "" {
				continue
			}

			// Check escrow status via contract query
			if isEscrowFunded(po.EscrowID) {
				log.Printf("✅ Escrow %s is funded! Processing release...", po.EscrowID)
				go processRelease(orderID, po)
				delete(pendingOrders, orderID)
				delete(escrowToOrder, po.EscrowID)
			}
		}
		mu.Unlock()
	}
}

// isEscrowFunded checks if an escrow has been funded
func isEscrowFunded(escrowID string) bool {
	// Query the escrow contract to check status
	// For now, we'll use stellar CLI to query
	cmd := exec.Command("stellar", "contract", "invoke",
		"--id", PaymentEscrowID,
		"--source", "deployer",
		"--network", "testnet",
		"--",
		"get_escrow",
		"--escrow_id", escrowID,
	)

	output, err := cmd.Output()
	if err != nil {
		return false
	}

	// Check if escrow exists and has funds
	return strings.Contains(string(output), "amount") && !strings.Contains(string(output), "0")
}

// processRelease releases escrow and mints ZMOKE
func processRelease(orderID int, po *PendingOrder) {
	log.Printf("🔓 Releasing escrow %s for Order #%d", po.EscrowID, orderID)

	// 1. Release escrow
	txHash, err := releaseEscrow(po.EscrowID)
	if err != nil {
		log.Printf("❌ Failed to release escrow: %v", err)
		return
	}
	log.Printf("✅ Escrow released: %s", txHash)

	// 2. Mint ZMOKE ($1 = 10 ZMOKE)
	zmokeAmount := int64(po.Total * 10)
	if zmokeTxHash, err := distributeZmoke(po.BuyerAddress, zmokeAmount); err != nil {
		log.Printf("⚠️ Failed to distribute ZMOKE: %v", err)
		// Continue to update WC anyway
	} else {
		log.Printf("✅ Distributed %d ZMOKE to %s (tx: %s)", zmokeAmount, po.BuyerAddress, zmokeTxHash)
	}

	// 3. Update WC order to "processing"
	if err := wcClient.UpdateOrderStatus(orderID, "processing", txHash); err != nil {
		log.Printf("⚠️ Failed to update WC order: %v", err)
	} else {
		log.Printf("✅ Order #%d updated to processing", orderID)
	}
}

// Helper to extract tx hash from CLI output
func extractTxHash(output string) string {
	re := regexp.MustCompile(`[0-9a-f]{64}`)
	matches := re.FindAllString(output, -1)
	if len(matches) > 0 {
		return matches[0]
	}
	// Fallback
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		if strings.Contains(line, "Transaction") || strings.Contains(line, "hash") {
			return strings.TrimSpace(line)
		}
	}
	return "unknown"
}

// releaseEscrow calls the contract to release funds
func releaseEscrow(escrowID string) (string, error) {
	cmd := exec.Command("stellar", "contract", "invoke",
		"--id", PaymentEscrowID,
		"--source", "deployer",
		"--network", "testnet",
		"--",
		"release",
		"--escrow_id", escrowID,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("release failed: %s", string(output))
	}

	// Extract tx hash from output
	return extractTxHash(string(output)), nil
}

// checkAndReplenishZmoke checks distributor balance and mints 100k if below 50k
func checkAndReplenishZmoke() {
	distributorPubKey := os.Getenv("ZMOKE_DISTRIBUTOR_PUBLIC_KEY")
	issuerSecret := os.Getenv("ZMOKE_ISSUER_SECRET")
	issuerPublicKey := os.Getenv("ZMOKE_ISSUER_PUBLIC_KEY")

	if distributorPubKey == "" || issuerSecret == "" || issuerPublicKey == "" {
		log.Printf("⚠️ ZMOKE replenishment: missing env vars (ZMOKE_DISTRIBUTOR_PUBLIC_KEY, ZMOKE_ISSUER_SECRET, ZMOKE_ISSUER_PUBLIC_KEY)")
		return
	}

	// Check distributor balance via Horizon
	resp, err := http.Get(fmt.Sprintf("https://horizon-testnet.stellar.org/accounts/%s", distributorPubKey))
	if err != nil {
		log.Printf("⚠️ Failed to check distributor balance: %v", err)
		return
	}
	defer resp.Body.Close()

	var account struct {
		Balances []struct {
			AssetCode string `json:"asset_code"`
			Balance   string `json:"balance"`
		} `json:"balances"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&account); err != nil {
		log.Printf("⚠️ Failed to parse distributor account: %v", err)
		return
	}

	var zmokeBalance float64
	for _, b := range account.Balances {
		if b.AssetCode == "ZMOKE" {
			zmokeBalance, _ = strconv.ParseFloat(b.Balance, 64)
			break
		}
	}

	log.Printf("📊 Distributor ZMOKE balance: %.2f", zmokeBalance)

	// Threshold: 50,000 ZMOKE
	if zmokeBalance < 50000 {
		log.Printf("⚠️ Distributor low on ZMOKE (%.2f < 50000), replenishing 100,000...", zmokeBalance)

		// Mint 100k ZMOKE (100,000 * 10^7 stroops)
		replenishAmount := int64(100000) * 10000000

		cmdBuild := exec.Command("stellar", "tx", "new", "payment",
			"--source", issuerPublicKey,
			"--destination", distributorPubKey,
			"--asset", fmt.Sprintf("ZMOKE:%s", issuerPublicKey),
			"--amount", fmt.Sprintf("%d", replenishAmount),
			"--network", "testnet",
			"--build-only",
		)

		var stderrBuild bytes.Buffer
		cmdBuild.Stderr = &stderrBuild
		xdrBuild, err := cmdBuild.Output()
		if err != nil {
			log.Printf("❌ Replenish build failed: %s", stderrBuild.String())
			return
		}

		cmdSign := exec.Command("stellar", "tx", "sign",
			"--sign-with-key", issuerSecret,
			"--network", "testnet",
		)
		cmdSign.Stdin = bytes.NewReader(xdrBuild)

		var stderrSign bytes.Buffer
		cmdSign.Stderr = &stderrSign
		xdrSigned, err := cmdSign.Output()
		if err != nil {
			log.Printf("❌ Replenish sign failed: %s", stderrSign.String())
			return
		}

		cmdSend := exec.Command("stellar", "tx", "send",
			"--network", "testnet",
		)
		cmdSend.Stdin = bytes.NewReader(xdrSigned)

		output, err := cmdSend.CombinedOutput()
		if err != nil {
			log.Printf("❌ Replenish send failed: %s", string(output))
			return
		}

		log.Printf("✅ Replenished 100,000 ZMOKE to distributor: %s", strings.TrimSpace(string(output)))
	}
}

// distributeZmoke sends ZMOKE tokens from Distributor to a user
// Returns (txHash, error)
func distributeZmoke(destination string, amount int64) (string, error) {
	// Check and replenish if needed (runs async to not block)
	go checkAndReplenishZmoke()

	distributorSecret := os.Getenv("ZMOKE_DISTRIBUTOR_SECRET")
	issuerPublicKey := os.Getenv("ZMOKE_ISSUER_PUBLIC_KEY")

	if distributorSecret == "" || issuerPublicKey == "" {
		return "", fmt.Errorf("ZMOKE_DISTRIBUTOR_SECRET or ZMOKE_ISSUER_PUBLIC_KEY not set")
	}

	kp, err := keypair.ParseFull(distributorSecret)
	if err != nil {
		return "", fmt.Errorf("invalid distributor keypair: %w", err)
	}

	// Convert amount to stroops (1 ZMOKE = 10^7 stroops)
	amountInStroops := amount * 10000000

	log.Printf("Coin Distributing %d ZMOKE (%d stroops) to %s from %s", amount, amountInStroops, destination, kp.Address())

	// 1. Build Transaction (Payment)
	cmdBuild := exec.Command("stellar", "tx", "new", "payment",
		"--source", kp.Address(),
		"--destination", destination,
		"--asset", fmt.Sprintf("ZMOKE:%s", issuerPublicKey),
		"--amount", fmt.Sprintf("%d", amountInStroops),
		"--network", "testnet",
		"--build-only",
	)

	var stderrBuild bytes.Buffer
	cmdBuild.Stderr = &stderrBuild
	xdrBuild, err := cmdBuild.Output()
	if err != nil {
		return "", fmt.Errorf("build tx failed: %s (stderr: %s)", err, stderrBuild.String())
	}

	// 2. Sign Transaction
	cmdSign := exec.Command("stellar", "tx", "sign",
		"--sign-with-key", distributorSecret,
		"--network", "testnet",
	)
	cmdSign.Stdin = bytes.NewReader(xdrBuild)

	var stderrSign bytes.Buffer
	cmdSign.Stderr = &stderrSign
	xdrSigned, err := cmdSign.Output()
	if err != nil {
		return "", fmt.Errorf("sign tx failed: %s (stderr: %s)", err, stderrSign.String())
	}

	// 3. Submit Transaction
	cmdSend := exec.Command("stellar", "tx", "send",
		"--network", "testnet",
	)
	cmdSend.Stdin = bytes.NewReader(xdrSigned)

	output, err := cmdSend.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("send tx failed: %s", string(output))
	}

	// Parse tx hash from output
	txHash := extractTxHash(string(output))
	log.Printf("ZMOKE tx output: %s", txHash)

	return txHash, nil
}

// Legacy handler for order-completed webhook
func handleOrderCompleted(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var order OrderPayload
	if err := json.NewDecoder(r.Body).Decode(&order); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	log.Printf("📦 Legacy: Order #%d: %s for %s", order.ID, order.Status, order.Total)
	w.WriteHeader(http.StatusOK)
}

// ============================================================
// PRICE ORACLE: Reflector XLM/USD Price Feed
// ============================================================

// PriceCache holds cached price data
type PriceCache struct {
	XlmPerUsd float64   `json:"xlm_per_usd"`
	PriceUsd  float64   `json:"price_usd"`
	Timestamp int64     `json:"timestamp"`
	CachedAt  time.Time `json:"-"`
}

var (
	priceCache   *PriceCache
	priceCacheMu sync.RWMutex
)

const (
	PriceCacheDuration = 300 * time.Second // 5 minutes - matches Reflector oracle update frequency
	// CEX/DEX Exchange Rates Oracle - Most accurate for crypto (has XLM, BTC, ETH, etc.)
	ReflectorCEXDEXID = "CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63"
	// Foreign Exchange Rates Oracle (has XLM too, but derived from FX)
	ReflectorFXID = "CCSSOHTBL3LEWUCBBEB5NJFC2OKFRC74OWEIJIZLRJBGAAU4VMU5NV4W"
	// USDC Oracle (Stellar Pubnet - AQUA, yUSDC, SSLX, EURC)
	ReflectorUSDCID = "CAVLP5DH2GJPZMVO7IJY4CVOD5MWEFTJFVPD2YY2FQXOQHRGHK4D6HLP"
)

// handlePriceXLM returns live XLM/USD price from Reflector Oracle
func handlePriceXLM(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check cache first
	priceCacheMu.RLock()
	if priceCache != nil && time.Since(priceCache.CachedAt) < PriceCacheDuration {
		cached := *priceCache
		priceCacheMu.RUnlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cached)
		return
	}
	priceCacheMu.RUnlock()

	// Fetch fresh price from Reflector
	price, err := fetchReflectorPrice()
	if err != nil {
		log.Printf("❌ Failed to fetch Reflector price: %v", err)
		http.Error(w, "Failed to fetch price: "+err.Error(), http.StatusServiceUnavailable)
		return
	}

	// Update cache
	priceCacheMu.Lock()
	priceCache = price
	priceCacheMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(price)
}

// fetchReflectorPrice fetches XLM/USD price from Reflector CEX/DEX Oracle
func fetchReflectorPrice() (*PriceCache, error) {
	// Use Stellar CLI to query Reflector CEX/DEX Oracle for XLM price
	// Asset format: {"Other":"XLM"} for major cryptos
	cmd := exec.Command("stellar", "contract", "invoke",
		"--id", ReflectorCEXDEXID,
		"--network", "testnet",
		"--source", "deployer",
		"--send=no",
		"--",
		"lastprice",
		"--asset", `{"Other":"XLM"}`,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("reflector call failed: %v (output: %s)", err, string(output))
	}

	outputStr := strings.TrimSpace(string(output))
	log.Printf("📊 Reflector FX raw output: %s", outputStr)

	// Parse JSON response: {"price":"...","timestamp":...}
	var priceData struct {
		Price     string `json:"price"`
		Timestamp int64  `json:"timestamp"`
	}

	if err := json.Unmarshal([]byte(outputStr), &priceData); err != nil {
		// Check for null response
		if outputStr == "null" {
			return nil, fmt.Errorf("XLM price not available from oracle")
		}
		return nil, fmt.Errorf("failed to parse price data: %v (raw: %s)", err, outputStr)
	}

	// Parse price (14 decimals as per Reflector spec)
	priceInt, err := strconv.ParseInt(priceData.Price, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid price value: %s", priceData.Price)
	}

	// Reflector FX uses 14 decimals, base is USD
	// Price represents: how much USD per 1 XLM
	priceUsd := float64(priceInt) / 100000000000000.0 // 10^14
	xlmPerUsd := 1.0 / priceUsd

	log.Printf("📊 Live XLM price from Reflector: $%.4f (1 USD = %.2f XLM)", priceUsd, xlmPerUsd)

	return &PriceCache{
		XlmPerUsd: xlmPerUsd,
		PriceUsd:  priceUsd,
		Timestamp: priceData.Timestamp,
		CachedAt:  time.Now(),
	}, nil
}

// parseReflectorOutput parses Soroban CLI output format
func parseReflectorOutput(output string) (int64, int64, error) {
	// Handle various output formats from Stellar CLI
	// Format 1: {"price":"2347000","timestamp":"1738505000"}
	// Format 2: PriceData { price: 2347000, timestamp: 1738505000 }
	// Format 3: Some(PriceData { ... })

	// Try to extract price and timestamp using regex
	priceRegex := regexp.MustCompile(`price["\s:]+(\d+)`)
	tsRegex := regexp.MustCompile(`timestamp["\s:]+(\d+)`)

	priceMatch := priceRegex.FindStringSubmatch(output)
	tsMatch := tsRegex.FindStringSubmatch(output)

	if len(priceMatch) < 2 {
		return 0, 0, fmt.Errorf("could not find price in output")
	}

	price, err := strconv.ParseInt(priceMatch[1], 10, 64)
	if err != nil {
		return 0, 0, err
	}

	var timestamp int64 = time.Now().Unix()
	if len(tsMatch) >= 2 {
		timestamp, _ = strconv.ParseInt(tsMatch[1], 10, 64)
	}

	return price, timestamp, nil
}
