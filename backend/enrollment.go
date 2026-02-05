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

	"github.com/stellar/go/keypair"
)

// EnrollRequest is the input for wallet enrollment
type EnrollRequest struct {
	UserID int    `json:"user_id"` // 0 if new user
	Email  string `json:"email"`   // Required for new user creation
}

// EnrollResponse returns the new wallet keys (SECRET SHOWN ONCE)
type EnrollResponse struct {
	UserID    int    `json:"user_id"`
	PublicKey string `json:"public_key"`
	SecretKey string `json:"secret_key"`
	Message   string `json:"message"`
}

// handleEnrollUser creates a new Stellar wallet for a WooCommerce user
// POST /api/enroll-user
// - Creates WooCommerce user if user_id is 0 (with role "Stellar Customer")
// - Generates new keypair
// - Funds with 1.5 XLM from operational wallet
// - Adds ZMOKE trustline
// - Returns keys (secret shown ONCE to user, never stored)
func handleEnrollUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req EnrollRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request: "+err.Error(), http.StatusBadRequest)
		return
	}

	userID := req.UserID

	// If no user ID provided, create a new WooCommerce user
	if userID == 0 {
		if req.Email == "" {
			http.Error(w, "Email required for new user enrollment", http.StatusBadRequest)
			return
		}

		log.Printf("👤 Creating new WooCommerce user for %s...", req.Email)
		newUserID, err := createWooUser(req.Email)
		if err != nil {
			log.Printf("❌ Failed to create WC user: %v", err)
			http.Error(w, "Failed to create user: "+err.Error(), http.StatusInternalServerError)
			return
		}
		userID = newUserID
		log.Printf("✅ Created WooCommerce user ID: %d", userID)
	}

	log.Printf("🔐 Enrolling user %d in ZMOKE rewards...", userID)

	// 1. Generate new keypair
	newKP, err := keypair.Random()
	if err != nil {
		log.Printf("❌ Failed to generate keypair: %v", err)
		http.Error(w, "Failed to generate wallet", http.StatusInternalServerError)
		return
	}

	log.Printf("🔑 Generated new wallet: %s", newKP.Address())

	// 2. Fund wallet with 1.5 XLM from operational wallet
	operationalSecret := os.Getenv("OPERATIONAL_WALLET_SECRET")
	if operationalSecret == "" {
		log.Printf("❌ OPERATIONAL_WALLET_SECRET not set")
		http.Error(w, "Server misconfigured: missing operational wallet", http.StatusInternalServerError)
		return
	}

	opKP, err := keypair.ParseFull(operationalSecret)
	if err != nil {
		log.Printf("❌ Invalid operational keypair: %v", err)
		http.Error(w, "Server misconfigured: invalid operational wallet", http.StatusInternalServerError)
		return
	}

	// Build create_account transaction (1.5 XLM = 15000000 stroops)
	// Using stellar CLI for simplicity
	cmdCreate := exec.Command("stellar", "tx", "new", "create-account",
		"--source", opKP.Address(),
		"--destination", newKP.Address(),
		"--starting-balance", "15000000", // 1.5 XLM in stroops
		"--network", "testnet",
		"--build-only",
	)

	var stderrCreate bytes.Buffer
	cmdCreate.Stderr = &stderrCreate
	xdrCreate, err := cmdCreate.Output()
	if err != nil {
		log.Printf("❌ Failed to build create_account tx: %s", stderrCreate.String())
		http.Error(w, "Failed to create wallet: "+stderrCreate.String(), http.StatusInternalServerError)
		return
	}

	// Sign with operational wallet
	cmdSign := exec.Command("stellar", "tx", "sign",
		"--sign-with-key", operationalSecret,
		"--network", "testnet",
	)
	cmdSign.Stdin = bytes.NewReader(xdrCreate)

	var stderrSign bytes.Buffer
	cmdSign.Stderr = &stderrSign
	xdrSigned, err := cmdSign.Output()
	if err != nil {
		log.Printf("❌ Failed to sign create_account tx: %s", stderrSign.String())
		http.Error(w, "Failed to sign transaction", http.StatusInternalServerError)
		return
	}

	// Submit
	cmdSend := exec.Command("stellar", "tx", "send", "--network", "testnet")
	cmdSend.Stdin = bytes.NewReader(xdrSigned)

	output, err := cmdSend.CombinedOutput()
	if err != nil {
		log.Printf("❌ Failed to fund wallet: %s", string(output))
		http.Error(w, "Failed to fund wallet: "+string(output), http.StatusInternalServerError)
		return
	}

	log.Printf("✅ Funded wallet %s with 1.5 XLM", newKP.Address())

	// 3. Add ZMOKE trustline
	issuerPublicKey := os.Getenv("ZMOKE_ISSUER_PUBLIC_KEY")
	if issuerPublicKey == "" {
		log.Printf("⚠️ ZMOKE_ISSUER_PUBLIC_KEY not set, skipping trustline")
	} else {
		if err := addZmokeTrustline(newKP, issuerPublicKey); err != nil {
			log.Printf("⚠️ Failed to add ZMOKE trustline: %v", err)
			// Don't fail the whole enrollment, user can add trustline later
		} else {
			log.Printf("✅ Added ZMOKE trustline for %s", newKP.Address())
		}
	}

	// 4. Update WooCommerce user meta with public key
	if userID > 0 {
		if err := updateWooUserMeta(userID, newKP.Address()); err != nil {
			log.Printf("⚠️ Failed to update WC user meta: %v", err)
			// Non-fatal, user can still get their keys
		}
	}

	log.Printf("🎉 User %d enrolled successfully with wallet %s", userID, newKP.Address())

	// Return keys - SECRET IS SHOWN ONCE, NEVER STORED
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(EnrollResponse{
		UserID:    userID,
		PublicKey: newKP.Address(),
		SecretKey: newKP.Seed(),
		Message:   "IMPORTANT: Write down your Secret Key. We do NOT store it. If lost, your ZMOKE cannot be recovered.",
	})
}

// addZmokeTrustline adds a trustline for ZMOKE to the new wallet
func addZmokeTrustline(kp *keypair.Full, issuerPubKey string) error {
	// Build change_trust transaction
	cmdTrust := exec.Command("stellar", "tx", "new", "change-trust",
		"--source", kp.Address(),
		"--asset", fmt.Sprintf("ZMOKE:%s", issuerPubKey),
		"--network", "testnet",
		"--build-only",
	)

	var stderrTrust bytes.Buffer
	cmdTrust.Stderr = &stderrTrust
	xdrTrust, err := cmdTrust.Output()
	if err != nil {
		return fmt.Errorf("build failed: %s", stderrTrust.String())
	}

	// Sign with new wallet's secret
	cmdSign := exec.Command("stellar", "tx", "sign",
		"--sign-with-key", kp.Seed(),
		"--network", "testnet",
	)
	cmdSign.Stdin = bytes.NewReader(xdrTrust)

	var stderrSign bytes.Buffer
	cmdSign.Stderr = &stderrSign
	xdrSigned, err := cmdSign.Output()
	if err != nil {
		return fmt.Errorf("sign failed: %s", stderrSign.String())
	}

	// Submit
	cmdSend := exec.Command("stellar", "tx", "send", "--network", "testnet")
	cmdSend.Stdin = bytes.NewReader(xdrSigned)

	output, err := cmdSend.CombinedOutput()
	if err != nil {
		return fmt.Errorf("send failed: %s", string(output))
	}

	return nil
}

// updateWooUserMeta saves the public key and role using our custom Stellar API endpoint
func updateWooUserMeta(userID int, publicKey string) error {
	wcBaseURL := os.Getenv("WC_BASE_URL")
	wcKey := os.Getenv("WC_CONSUMER_KEY")
	wcSecret := os.Getenv("WC_CONSUMER_SECRET")

	if wcBaseURL == "" || wcKey == "" || wcSecret == "" {
		return fmt.Errorf("WC credentials not configured")
	}

	// Use our custom Smoky Stellar API endpoint (bypasses WC API limitations)
	url := fmt.Sprintf("%s/wp-json/smoky-stellar/v1/user/%d", wcBaseURL, userID)

	payload := map[string]interface{}{
		"role":       "stellar_customer",
		"public_key": publicKey,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	log.Printf("📤 Updating WC user %d via Smoky Stellar API: role=stellar_customer, key=%s...%s",
		userID, publicKey[:8], publicKey[len(publicKey)-4:])

	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(body))
	if err != nil {
		return err
	}

	req.SetBasicAuth(wcKey, wcSecret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		log.Printf("❌ Smoky Stellar API error %d updating user %d: %s", resp.StatusCode, userID, string(respBody))
		return fmt.Errorf("Smoky Stellar API error: %d - %s", resp.StatusCode, string(respBody))
	}

	log.Printf("✅ Updated WC user %d with stellar_customer role and public key: %s", userID, string(respBody))
	return nil
}

// getUserStellarAddress fetches the user's existing Stellar public key from WC meta
func getUserStellarAddress(userID int) (string, error) {
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

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("WC API error: %d", resp.StatusCode)
	}

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

	return "", nil // No wallet found
}

// createWooUser creates a new WooCommerce customer with "stellar_customer" role
func createWooUser(email string) (int, error) {
	wcBaseURL := os.Getenv("WC_BASE_URL")
	wcKey := os.Getenv("WC_CONSUMER_KEY")
	wcSecret := os.Getenv("WC_CONSUMER_SECRET")

	if wcBaseURL == "" || wcKey == "" || wcSecret == "" {
		return 0, fmt.Errorf("WC credentials not configured")
	}

	url := fmt.Sprintf("%s/wp-json/wc/v3/customers", wcBaseURL)

	// Generate a username from email (before @)
	username := email
	if atIdx := len(email); atIdx > 0 {
		for i, c := range email {
			if c == '@' {
				username = email[:i]
				break
			}
		}
	}

	payload := map[string]interface{}{
		"email":    email,
		"username": username,
		"role":     "stellar_customer", // Custom role for ZMOKE users
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return 0, err
	}

	log.Printf("📤 Creating WC user: email=%s, username=%s, role=stellar_customer", email, username)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
	if err != nil {
		return 0, err
	}

	req.SetBasicAuth(wcKey, wcSecret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return 0, fmt.Errorf("WC API error %d: %s", resp.StatusCode, string(respBody))
	}

	// Parse response to get user ID and verify role
	var result struct {
		ID   int    `json:"id"`
		Role string `json:"role"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return 0, fmt.Errorf("failed to parse response: %w", err)
	}

	log.Printf("✅ Created WC user ID %d with role: %s", result.ID, result.Role)

	// If WC assigned wrong role, update it
	if result.Role != "stellar_customer" {
		log.Printf("⚠️ WC assigned role '%s' instead of 'stellar_customer', updating...", result.Role)
		// We'll update the role via updateWooUserMeta later (during enrollment)
	}

	return result.ID, nil
}

// performEnrollment is the internal enrollment logic (used by both HTTP handler and payment confirm)
func performEnrollment(userID int) (*EnrollResponse, error) {
	// SAFETY: Check if user already has a wallet - don't overwrite!
	existingPubKey, err := getUserStellarAddress(userID)
	if err == nil && existingPubKey != "" {
		log.Printf("⚠️ User %d already has wallet %s - skipping enrollment", userID, existingPubKey)
		return &EnrollResponse{
			UserID:    userID,
			PublicKey: existingPubKey,
			SecretKey: "", // Empty - we don't have it (never stored)
			Message:   "You already have a wallet linked to your account. Secret key was shown during initial signup.",
		}, nil
	}

	// 1. Generate new keypair
	newKP, err := keypair.Random()
	if err != nil {
		return nil, fmt.Errorf("failed to generate keypair: %w", err)
	}

	log.Printf("🔑 Generated new wallet: %s", newKP.Address())

	// 2. Fund wallet with 1.5 XLM from operational wallet
	operationalSecret := os.Getenv("OPERATIONAL_WALLET_SECRET")
	if operationalSecret == "" {
		return nil, fmt.Errorf("OPERATIONAL_WALLET_SECRET not set")
	}

	opKP, err := keypair.ParseFull(operationalSecret)
	if err != nil {
		return nil, fmt.Errorf("invalid operational keypair: %w", err)
	}

	// Build create_account transaction (1.5 XLM = 15000000 stroops)
	cmdCreate := exec.Command("stellar", "tx", "new", "create-account",
		"--source", opKP.Address(),
		"--destination", newKP.Address(),
		"--starting-balance", "15000000",
		"--network", "testnet",
		"--build-only",
	)

	var stderrCreate bytes.Buffer
	cmdCreate.Stderr = &stderrCreate
	xdrCreate, err := cmdCreate.Output()
	if err != nil {
		return nil, fmt.Errorf("build create_account failed: %s", stderrCreate.String())
	}

	// Sign with operational wallet
	cmdSign := exec.Command("stellar", "tx", "sign",
		"--sign-with-key", operationalSecret,
		"--network", "testnet",
	)
	cmdSign.Stdin = bytes.NewReader(xdrCreate)

	var stderrSign bytes.Buffer
	cmdSign.Stderr = &stderrSign
	xdrSigned, err := cmdSign.Output()
	if err != nil {
		return nil, fmt.Errorf("sign failed: %s", stderrSign.String())
	}

	// Submit
	cmdSend := exec.Command("stellar", "tx", "send", "--network", "testnet")
	cmdSend.Stdin = bytes.NewReader(xdrSigned)

	output, err := cmdSend.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("fund wallet failed: %s", string(output))
	}

	log.Printf("✅ Funded wallet %s with 1.5 XLM", newKP.Address())

	// 3. Add ZMOKE trustline
	issuerPublicKey := os.Getenv("ZMOKE_ISSUER_PUBLIC_KEY")
	if issuerPublicKey != "" {
		if err := addZmokeTrustline(newKP, issuerPublicKey); err != nil {
			log.Printf("⚠️ Failed to add ZMOKE trustline: %v", err)
		} else {
			log.Printf("✅ Added ZMOKE trustline for %s", newKP.Address())
		}
	}

	// 4. Update WooCommerce user meta with public key
	if userID > 0 {
		if err := updateWooUserMeta(userID, newKP.Address()); err != nil {
			log.Printf("⚠️ Failed to update WC user meta: %v", err)
		}
	}

	return &EnrollResponse{
		UserID:    userID,
		PublicKey: newKP.Address(),
		SecretKey: newKP.Seed(),
		Message:   "IMPORTANT: Write down your Secret Key. We do NOT store it. If lost, your ZMOKE cannot be recovered.",
	}, nil
}

// getOrderCustomerID extracts customer ID from order (returns 0 for guest orders)
func getOrderCustomerID(order *OrderPayload) int {
	// WC API orders have customer_id field, but our OrderPayload doesn't have it yet
	// For now, return 0 (will be enhanced when we add customer_id to OrderPayload)
	return 0
}

// linkOrderToUser updates an order to link it to a user
func linkOrderToUser(orderID int, userID int) error {
	wcBaseURL := os.Getenv("WC_BASE_URL")
	wcKey := os.Getenv("WC_CONSUMER_KEY")
	wcSecret := os.Getenv("WC_CONSUMER_SECRET")

	if wcBaseURL == "" || wcKey == "" || wcSecret == "" {
		return fmt.Errorf("WC credentials not configured")
	}

	url := fmt.Sprintf("%s/wp-json/wc/v3/orders/%d", wcBaseURL, orderID)

	payload := map[string]interface{}{
		"customer_id": userID,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(body))
	if err != nil {
		return err
	}

	req.SetBasicAuth(wcKey, wcSecret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("WC API error %d: %s", resp.StatusCode, string(respBody))
	}

	log.Printf("✅ Linked order #%d to user ID %d", orderID, userID)
	return nil
}
