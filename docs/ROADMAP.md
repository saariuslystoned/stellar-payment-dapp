# Stellar Payment DApp - Roadmap

This document outlines the development path for the Stellar Payment DApp.

## Current Status: v2 (Blend-Integrated)

The v2 release implements **Option B: Direct Contract Deposits with Blend Yield**.

### ✅ Completed Features

*   **Pool Contract** (`pool_contract`) deployed and verified on Testnet.
    *   Contract ID: `CB2CUWS24XBZ2NYU2USBMAENZDFFRXB5PM4PPZYOFG2N2ASFJM7EM6K4`
    *   Direct deposits (USDC & XLM) from buyers
    *   **Automatic Blend Integration**: Deposits auto-supply to Blend Protocol for yield
    *   Uses `authorize_as_current_contract()` for proper cross-contract auth
    *   2% platform fee (configurable)
    *   Batch settlement capability (MSM-ready)
*   **Blend Protocol Integration**:
    *   Upgraded to `soroban-sdk v25.0.1` and `blend-contract-sdk v2.25.0`
    *   Custom Blend pool with USDC and XLM deposited successfully
    *   Used `blend-utils` mocking scripts to create mock coins for experimentation
    *   bToken positions earning yield automatically
*   **WooCommerce Plugin (v2.0.0)**:
    *   ZMOKE rewards enrollment checkbox with $0.25 activation fee
    *   User account creation with custom `stellar_customer` role
    *   G-address attached to user profile via `_stellar_public_key` meta
    *   Custom REST endpoint `/smoky-stellar/v1/user/{id}` (bypasses WC meta limitations)
    *   WordPress Admin UI: G-key visible in user profile and Users list column
    *   My Account page displays G-address and live ZMOKE balance (via Horizon API)
    *   Secret key modal for one-time display of wallet credentials
    *   Store credit system with checkout integration
*   **Frontend**: React/Vite interface with Albedo wallet integration
    *   Deployed to Cloudflare Pages: `https://smoky-frontend.pages.dev`
*   **Backend**: Go backend with WooCommerce integration
    *   Automatic order status updates on deposit confirmation
    *   ZMOKE token reward distribution ($1 = 10 ZMOKE)
    *   User enrollment endpoint for wallet creation
*   **ZMOKE Rewards**: Auto-replenishment when distributor balance < 50k tokens

---

## Roadmap: Path to v3

### Phase 1: Settlement & Withdrawals (Immediate Term)
*   [ ] **Withdraw from Blend**: Implement `withdraw_from_blend()` to reclaim supplied funds + yield
*   [ ] **Batch Settlement**: Trigger settlements via admin or automated job
*   [ ] **Yield Distribution**: Calculate and distribute earned yield to platform/seller
    *   *Why*: Complete the yield loop - currently funds are supplied but not yet withdrawn.

### Phase 2: Admin Dashboard & UX Fixes (Medium Term)
*   [ ] **Enrollment Payment Restriction**: Only allow ZMOKE enrollment when a non-Stellar payment method is selected
    *   *Issue*: If user enrolls but pays with their existing Stellar wallet, rewards credit to the paying wallet—not the newly created enrollment wallet
    *   *Fix*: Hide enrollment checkbox when Stellar/USDC is the selected payment method at checkout
    *   *Benefit*: Non-crypto-savvy users can manage rewards entirely through WooCommerce UI without needing wallet access
*   [ ] **Admin UI**: Protected route for admin operations
    *   View total deposits (USDC/XLM)
    *   View Blend pool positions and earned yield
    *   Trigger settlements
    *   Withdraw platform fees
*   [ ] **Order Management**: View pending/completed orders with deposit status

### Phase 3: Production Readiness (Long Term)
*   [ ] **MSM Verification**: Implement Multi-Scalar Multiplication for batch proofs
*   [ ] **Security Audit**: Third-party review of pool_contract
*   [ ] **Mainnet Deployment**: Configuration for Stellar Mainnet + Blend Mainnet
*   [ ] **ZMOKE Issuer Key Isolation**:
    *   Move ZMOKE_ISSUER_SECRET to separate secure service
    *   Implement HSM or multi-sig for production minting

---

## Technical Milestones Achieved (Feb 2026)

| Date | Milestone |
|------|-----------|
| Feb 4 | ✅ Pool contract deployed with Blend integration |
| Feb 4 | ✅ Upgraded to soroban-sdk v25 + blend-contract-sdk v2.25 |
| Feb 4 | ✅ Fixed cross-contract auth with `authorize_as_current_contract()` |
| Feb 4 | ✅ USDC and XLM deposited to custom Blend pool |
| Feb 4 | ✅ Resolved Blend pool issues using `blend-utils` mock coin scripts |
| Feb 4 | ✅ End-to-end flow: Deposit → Blend Supply → WooCommerce update → ZMOKE rewards |
| Feb 5 | ✅ WooCommerce plugin v2.0.0 with enrollment, `stellar_customer` role |
| Feb 5 | ✅ G-address attached to user profile, visible in WP Admin |
| Feb 5 | ✅ My Account page displays G-address and live ZMOKE balance (Horizon API) |
| Feb 5 | ✅ Custom REST endpoint bypasses WC REST API meta limitations |

---

## Development Workflow
1.  **Clone** the repository.
2.  **Install** dependencies (`npm install` in frontend).
3.  **Deploy** contracts to Testnet (`stellar contract deploy`).
4.  **Configure** Blend pool addresses via `set_blend_pools`.
5.  **Run** local dev server (`npm run dev`).
