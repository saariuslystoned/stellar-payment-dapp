# Design: ZMOKE Spending Integration ("Burn-to-Credit" Model)

## 1. Executive Summary
**Goal**: Spend $ZMOKE on WooCommerce.
**Model**: Store Credit (Burn ZMOKE -> Get Credit).
**Constraints**: No external plugins. Non-Custodial. **User pays activation cost.**

## 2. Core Workflows

### A. Wallet Linkage & Enrollment

#### Scenario A: Existing Crypto User (Implicit Linkage)
*   User pays with Stellar. Backend links Public Key to User Meta.
*   If no ZMOKE trustline, user clicks "Claim" on order receipt (pays their own gas).

#### Scenario B: New User (Enrollment at Checkout)
1.  **Checkout**: User checks **[x] Enroll in ZMOKE Rewards ($0.25 Activation)**.
    *   **Logic**: Checking this box adds a **Fee** to the cart (approx $0.20 - $0.30 USD) to cover the 1.5 XLM.
2.  **Payment**: User pays Total + Activation Fee.
3.  **Backend Action**:
    *   Generates Keypair.
    *   **Auto-Funding**: Backend sends **1.5 XLM** (Min Balance + Trustline reserve) to the new wallet.
    *   Signs `change_trust(ZMOKE)`.
    *   Saves `Public Key` to User Meta.
4.  **Key Handoff**:
    *   "Order Received" page shows Secret Key **ONCE** in a secure modal.

### B. "Burn-to-Credit" (Spending)
User visits **My Account** -> **Wallet** tab.

1.  **Redemption**:
    *   Button: `[Redeem 5,000 ZMOKE for $50.00 Credit]`.
    *   User signs tx sending ZMOKE to `Treasury`.
2.  **Conversion**:
    *   Backend validates tx -> Backend increments `street_credit_balance` in User Meta.
3.  **Checkout**:
    *   Auto-detects credit. Applies negative fee: **"Store Credit: -$50.00"**.

## 3. Technical Implementation

### WooCommerce (PHP/JS)
*   **Checkout Hook**:
    *   If `enroll_checkbox` is checked -> `search_fees` -> Add "Wallet Activation Fee".
*   **Order Complete Hook**:
    *   If `enroll_checkbox` was true -> Call Backend `POST /api/enroll-user`.

### Backend (Go)
*   `POST /api/enroll-user`:
    *   Input: `user_id`.
    *   Action: Send 1.5 XLM from Operational Wallet to New Wallet. Trust ZMOKE. Return Keys.

## 4. Accounting
*   **Activation Fee**: Recorded as Revenue (Service Charge) to offset the Cost of Goods Sold (XLM sent).
*   **Store Credit**: Liability on books.

## 5. Next Steps
1.  **Backend**: Build `POST /api/enroll-user`.
2.  **Frontend/WP**: Build the Checkout Checkbox + Fee Logic.
