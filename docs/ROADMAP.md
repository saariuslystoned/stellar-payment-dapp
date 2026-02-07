# Stellar Payment DApp - Roadmap

This document outlines the development path for the Stellar Payment DApp.

## Current Status: v2.2 (Blend-Integrated + Gasless Deposits)

The v2.2 release adds **gasless buyer deposits** via fee-bump transaction sponsorship, on top of the Blend yield integration and BLND emission claiming from v2.1.

### ✅ Completed Features

- **Pool Contract** (`pool_contract`) deployed and verified on Testnet.
  - Contract ID: `CCHVVL26PYRYRJR4OXEEAHNHMP6OAPEJT26EZRZXVDYL3HWHCD5SEDON`
  - Direct deposits (USDC & XLM) from buyers
  - **Automatic Blend Integration**: Deposits auto-supply to Blend Protocol for yield
  - Uses `authorize_as_current_contract()` for proper cross-contract auth
  - 2% platform fee (configurable)
  - Batch settlement capability (MSM-ready)
- **Blend Protocol Integration**:
  - Upgraded to `soroban-sdk v25.0.1` and `blend-contract-sdk v2.25.0`
  - Blend TESTNETv2 pool with Blend USDC and XLM supplied as collateral
  - Used `blend-utils` mocking scripts to create mock coins for experimentation
  - bToken positions earning yield automatically
  - **Blend USDC** (`CAQC...`) configured via `set_blend_usdc_token` — auto-supplied to Blend on deposit
  - **BLND Emissions**: `claim_emissions()` function added to pool contract for claiming accrued BLND rewards
  - Emissions research: wBTC supply (index 5) is the only supply-side emission on testnet; USDC/XLM supply earn lending yield but not BLND
- **WooCommerce Plugin (v2.0.0)**:
  - ZMOKE rewards enrollment checkbox with $0.25 activation fee
  - User account creation with custom `stellar_customer` role
  - G-address attached to user profile via `_stellar_public_key` meta
  - Custom REST endpoint `/smoky-stellar/v1/user/{id}` (bypasses WC meta limitations)
  - WordPress Admin UI: G-key visible in user profile and Users list column
  - My Account page displays G-address and live ZMOKE balance (via Horizon API)
  - Secret key modal for one-time display of wallet credentials
  - Store credit system with checkout integration
- **Frontend**: React/Vite interface with Albedo wallet integration
  - Deployed to Cloudflare Pages: `https://smoky-frontend.pages.dev`
- **Backend**: Go backend with WooCommerce integration
  - Automatic order status updates on deposit confirmation
  - ZMOKE token reward distribution ($1 = 10 ZMOKE)
  - User enrollment endpoint for wallet creation
- **ZMOKE Rewards**: Auto-replenishment when distributor balance < 50k tokens

---

## Roadmap: Path to v3

### Phase 1: Fee Sponsorship & Settlement (Immediate Term)

- [x] **Gasless Buyer Deposits**: Sponsor transaction fees so USDC-only buyers don't need XLM for gas
  - Use Stellar's native **fee-bump transactions** — backend wraps buyer-signed tx in a fee-bump envelope
  - Fee sponsor: **Oracle account** (`GDI3Y...NUV7S`, ~10,680 XLM — covers ~100M transactions)
  - Frontend sends signed XDR to backend `/tx/submit` instead of direct RPC submission
  - Backend fee-bumps with oracle keypair, then submits to Soroban RPC
  - _Why_: Eliminates the biggest UX barrier — no external dependencies, ~20 lines of code
- [ ] **Withdraw from Blend**: Implement `withdraw_from_blend()` to reclaim supplied funds + yield
- [ ] **Batch Settlement**: Trigger settlements via admin or automated job
- [ ] **Yield Distribution**: Calculate and distribute earned yield to platform/seller
  - _Why_: Complete the yield loop - currently funds are supplied but not yet withdrawn.

### Phase 2: Admin Dashboard & UX Fixes (Medium Term)

- [ ] **Enrollment Payment Restriction**: Only allow ZMOKE enrollment when a non-Stellar payment method is selected
  - _Issue_: If user enrolls but pays with their existing Stellar wallet, rewards credit to the paying wallet—not the newly created enrollment wallet
  - _Fix_: Hide enrollment checkbox when Stellar/USDC is the selected payment method at checkout
  - _Benefit_: Non-crypto-savvy users can manage rewards entirely through WooCommerce UI without needing wallet access
- [ ] **Admin UI**: Protected route for admin operations
  - View total deposits (USDC/XLM)
  - View Blend pool positions and earned yield
  - Trigger settlements
  - Withdraw platform fees
- [ ] **Order Management**: View pending/completed orders with deposit status

### Phase 3: Production Readiness (Long Term)

- [ ] **MSM Verification**: Implement Multi-Scalar Multiplication for batch proofs
- [ ] **Security Audit**: Third-party review of pool_contract
- [ ] **Mainnet Deployment**: Configuration for Stellar Mainnet + Blend Mainnet
- [ ] **ZMOKE Issuer Key Isolation**:
  - Move ZMOKE_ISSUER_SECRET to separate secure service
  - Implement HSM or multi-sig for production minting

---

## Technical Milestones Achieved (Feb 2026)

| Date  | Milestone                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------ |
| Feb 4 | ✅ Pool contract deployed with Blend integration                                                             |
| Feb 4 | ✅ Upgraded to soroban-sdk v25 + blend-contract-sdk v2.25                                                    |
| Feb 4 | ✅ Fixed cross-contract auth with `authorize_as_current_contract()`                                          |
| Feb 4 | ✅ USDC and XLM deposited to custom Blend pool                                                               |
| Feb 4 | ✅ Resolved Blend pool issues using `blend-utils` mock coin scripts                                          |
| Feb 4 | ✅ End-to-end flow: Deposit → Blend Supply → WooCommerce update → ZMOKE rewards                              |
| Feb 5 | ✅ WooCommerce plugin v2.0.0 with enrollment, `stellar_customer` role                                        |
| Feb 5 | ✅ G-address attached to user profile, visible in WP Admin                                                   |
| Feb 5 | ✅ My Account page displays G-address and live ZMOKE balance (Horizon API)                                   |
| Feb 5 | ✅ Custom REST endpoint bypasses WC REST API meta limitations                                                |
| Feb 7 | ✅ Blend USDC (`CAQC...`) integrated — auto-supplies to Blend pool on deposit                                |
| Feb 7 | ✅ Pool contract upgraded with `set_blend_usdc_token` and `claim_emissions` functions                        |
| Feb 7 | ✅ BLND emissions research: emissions pipeline (emitter → backstop → pool → claim) mapped                    |
| Feb 7 | ✅ Agent workflows updated: `/blend-position` shows supply positions + claimable BLND                        |
| Feb 7 | ✅ **Gasless deposits**: Fee-bump proxy (`/tx/submit`) — oracle sponsors buyer gas fees, verified on testnet |

---

## Development Workflow

1.  **Clone** the repository.
2.  **Install** dependencies (`npm install` in frontend).
3.  **Deploy** contracts to Testnet (`stellar contract deploy`).
4.  **Configure** Blend pool addresses via `set_blend_pools`.
5.  **Run** local dev server (`npm run dev`).
