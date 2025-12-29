# Smart Payment Platform Spec

## 1. Actors
* **Buyer:** Initiates the purchase.
* **Seller:** Receives funds after release.
* **Oracle (Admin):** Provides exchange rates and arbitrates disputes. Receives a 1% fee.

## 2. Business Logic (Smart Contract)
* **Escrow:** Funds are locked until the Oracle approves release.
* **Fees:** 1% deducted from Seller, 1% added to Buyer cost.
* **Volatility Protection:** Quotes valid for 60 seconds (enforced by timestamp).
* **Deposit Function:** Requires `amount`, `quote_price`, `oracle_signature`, and `timestamp`.

## 3. Technical Constraints (Frontend)
* **Wallet:** Must use Albedo SDK (via @creit.tech/stellar-wallets-kit) for connection and signing.
* **Framework:** React + Vite (Current Project Structure).