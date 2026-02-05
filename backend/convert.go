package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
)

// ConvertZmokeRequest is the input for ZMOKE -> Store Credit conversion
type ConvertZmokeRequest struct {
	UserID int    `json:"user_id"`
	TxHash string `json:"tx_hash"`
}

// ConvertZmokeResponse confirms the conversion
type ConvertZmokeResponse struct {
	Success     bool    `json:"success"`
	CreditAdded float64 `json:"credit_added"`
	NewBalance  float64 `json:"new_balance"`
	Message     string  `json:"message"`
}

// ZMOKE to USD conversion rate (10 ZMOKE = $1)
const ZmokeToUsdRate = 0.10

// handleConvertZmoke verifies a ZMOKE burn tx and credits user's store credit
// POST /api/convert-zmoke
func handleConvertZmoke(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ConvertZmokeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request: "+err.Error(), http.StatusBadRequest)
		return
	}

	log.Printf("💱 Convert ZMOKE request: User %d, TxHash %s", req.UserID, req.TxHash)

	// 1. Verify the transaction on Horizon
	zmokeAmount, senderAddr, err := verifyZmokeBurnTx(req.TxHash)
	if err != nil {
		log.Printf("❌ Tx verification failed: %v", err)
		http.Error(w, "Transaction verification failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	log.Printf("✅ Verified: %d ZMOKE from %s", zmokeAmount, senderAddr)

	// 2. Verify sender matches user's linked wallet
	userPubKey, err := getWooUserPublicKey(req.UserID)
	if err != nil {
		log.Printf("❌ Failed to get user wallet: %v", err)
		http.Error(w, "Could not verify wallet ownership", http.StatusBadRequest)
		return
	}

	if userPubKey != senderAddr {
		log.Printf("❌ Wallet mismatch: expected %s, got %s", userPubKey, senderAddr)
		http.Error(w, "Transaction sender does not match your linked wallet", http.StatusForbidden)
		return
	}

	// 3. Calculate credit amount (10 ZMOKE = $1)
	creditAmount := float64(zmokeAmount) * ZmokeToUsdRate

	// 4. Update user's store credit in WooCommerce
	newBalance, err := addStoreCredit(req.UserID, creditAmount)
	if err != nil {
		log.Printf("❌ Failed to add store credit: %v", err)
		http.Error(w, "Failed to add store credit: "+err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("🎉 Added $%.2f store credit for user %d (new balance: $%.2f)", creditAmount, req.UserID, newBalance)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ConvertZmokeResponse{
		Success:     true,
		CreditAdded: creditAmount,
		NewBalance:  newBalance,
		Message:     fmt.Sprintf("Converted %d ZMOKE to $%.2f store credit", zmokeAmount, creditAmount),
	})
}

// verifyZmokeBurnTx checks Horizon for the transaction and extracts ZMOKE payment details
func verifyZmokeBurnTx(txHash string) (int64, string, error) {
	treasuryAddr := os.Getenv("TREASURY_ADDRESS")
	issuerPubKey := os.Getenv("ZMOKE_ISSUER_PUBLIC_KEY")

	if treasuryAddr == "" || issuerPubKey == "" {
		return 0, "", fmt.Errorf("TREASURY_ADDRESS or ZMOKE_ISSUER_PUBLIC_KEY not configured")
	}

	// Fetch transaction from Horizon
	url := fmt.Sprintf("https://horizon-testnet.stellar.org/transactions/%s/operations", txHash)
	resp, err := http.Get(url)
	if err != nil {
		return 0, "", fmt.Errorf("failed to fetch tx: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return 0, "", fmt.Errorf("horizon error %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Embedded struct {
			Records []struct {
				Type        string `json:"type"`
				From        string `json:"from"`
				To          string `json:"to"`
				Amount      string `json:"amount"`
				AssetCode   string `json:"asset_code"`
				AssetIssuer string `json:"asset_issuer"`
			} `json:"records"`
		} `json:"_embedded"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, "", fmt.Errorf("failed to parse response: %w", err)
	}

	// Find the ZMOKE payment to treasury
	for _, op := range result.Embedded.Records {
		if op.Type == "payment" &&
			op.To == treasuryAddr &&
			op.AssetCode == "ZMOKE" &&
			op.AssetIssuer == issuerPubKey {

			amount, err := strconv.ParseFloat(op.Amount, 64)
			if err != nil {
				return 0, "", fmt.Errorf("invalid amount: %s", op.Amount)
			}
			return int64(amount), op.From, nil
		}
	}

	return 0, "", fmt.Errorf("no valid ZMOKE payment to treasury found in transaction")
}

// getWooUserPublicKey retrieves the user's linked Stellar public key from WooCommerce
func getWooUserPublicKey(userID int) (string, error) {
	wcBaseURL := os.Getenv("WC_BASE_URL")
	wcKey := os.Getenv("WC_CONSUMER_KEY")
	wcSecret := os.Getenv("WC_CONSUMER_SECRET")

	if wcBaseURL == "" || wcKey == "" || wcSecret == "" {
		return "", fmt.Errorf("WC credentials not configured")
	}

	url := fmt.Sprintf("%s/wp-json/wc/v3/customers/%d", wcBaseURL, userID)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}

	req.SetBasicAuth(wcKey, wcSecret)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var customer struct {
		MetaData []struct {
			Key   string `json:"key"`
			Value string `json:"value"`
		} `json:"meta_data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&customer); err != nil {
		return "", err
	}

	for _, meta := range customer.MetaData {
		if meta.Key == "_stellar_public_key" {
			return meta.Value, nil
		}
	}

	return "", fmt.Errorf("no stellar wallet linked to this user")
}

// addStoreCredit adds to the user's _zmoke_store_credit meta and returns new balance
func addStoreCredit(userID int, amount float64) (float64, error) {
	wcBaseURL := os.Getenv("WC_BASE_URL")
	wcKey := os.Getenv("WC_CONSUMER_KEY")
	wcSecret := os.Getenv("WC_CONSUMER_SECRET")

	if wcBaseURL == "" || wcKey == "" || wcSecret == "" {
		return 0, fmt.Errorf("WC credentials not configured")
	}

	// First, get current balance
	currentBalance := 0.0
	url := fmt.Sprintf("%s/wp-json/wc/v3/customers/%d", wcBaseURL, userID)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return 0, err
	}
	req.SetBasicAuth(wcKey, wcSecret)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}

	var customer struct {
		MetaData []struct {
			Key   string `json:"key"`
			Value string `json:"value"`
		} `json:"meta_data"`
	}

	json.NewDecoder(resp.Body).Decode(&customer)
	resp.Body.Close()

	for _, meta := range customer.MetaData {
		if meta.Key == "_zmoke_store_credit" {
			currentBalance, _ = strconv.ParseFloat(meta.Value, 64)
			break
		}
	}

	// Calculate new balance
	newBalance := currentBalance + amount

	// Update the user meta
	payload := map[string]interface{}{
		"meta_data": []map[string]string{
			{"key": "_zmoke_store_credit", "value": fmt.Sprintf("%.2f", newBalance)},
		},
	}

	body, _ := json.Marshal(payload)
	req, err = http.NewRequest("PUT", url, bytes.NewBuffer(body))
	if err != nil {
		return 0, err
	}

	req.SetBasicAuth(wcKey, wcSecret)
	req.Header.Set("Content-Type", "application/json")

	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return 0, fmt.Errorf("WC API error: %d", resp.StatusCode)
	}

	return newBalance, nil
}
