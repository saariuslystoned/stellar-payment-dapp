# Stellar Payment DApp - Roadmap

This document outlines the development path for the Stellar Payment DApp.

## Current Status: v1 (MVP)
The v1 release establishes the core functional loop on the Stellar Testnet.

*   **Smart Contract**: `payment_escrow` deployed and verified.
    *   Secure Deposits backed by Oracle signatures.
    *   Fee distribution (1% Buyer / 1% Seller).
    *   Admin-controlled Release.
*   **Frontend**: React/Vite interface.
    *   Albedo Wallet Integration.
    *   Deposit Form with Fee Preview.
*   **Infrastructure**: Local development scripts (Python) and Testnet deployment.

---

## Roadmap: Path to v2

### Phase 1: Robustness & UX (Immediate Term)
*   [ ] **Refund Mechanism**: Implement the `refund` function in the contract to handle expired or disputed escrows.
    *   *Why*: Critical for user safety. Funds shouldn't be stuck indefinitely.
*   **Admin Dashboard**:
    *   [ ] Create a protected route/page in the frontend for the Admin.
    *   [ ] Add "Release" and "Refund" buttons to replace CLI commands.
    *   *Why*: Operational efficiency and ease of use.

### Phase 2: Flexibility (Medium Term)
*   **Multi-Asset Support**:
    *   [ ] Refactor contract to accept any Stellar Asset (not just XLM/USDC hardcoding).
    *   [ ] Front-end token selector fetching assets from a list.
*   **Dynamic Oracle**:
    *   [ ] fully integrate Reflector or a Chainlink-style oracle for decentralized price feeds.
    *   [ ] Remove dependency on local python signing scripts for production.

### Phase 3: Production Readiness (Long Term)
*   **Security Audit**: Third-party review of the `payment_escrow` contract.
*   **Mainnet Deployment**: Configuration for Stellar Mainnet.
*   **Automated CI/CD**: GitHub Actions for building and testing on every PR.

## Development Workflow
1.  **Clone** the repository.
2.  **Install** dependencies (`npm install`).
3.  **Deploy** contracts to Testnet (`stellar contract deploy`).
4.  **Run** local dev server (`npm run dev`).
