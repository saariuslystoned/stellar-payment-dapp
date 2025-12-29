# Project Tasks

## v1: MVP (Completed)
- [x] **Smart Contract**: Implement Payment Escrow logic (Deposit, Release, Fees).
    - [x] Fee calculation (1% Buyer, 1% Seller).
    - [x] Oracle signature verification (Ed25519).
    - [x] Volatility protection (Timestamp checks).
- [x] **Oracle Integration**:
    - [x] Python scripts for generating signatures.
    - [x] Reflector Oracle integration for live prices.
- [x] **Frontend**:
    - [x] Setup Vite + React + TypeScript.
    - [x] Integrate Albedo for wallet connection.
    - [x] Implement Deposit Form UI.
    - [x] Connect functionality to Soroban contract.
    - [x] Display Fee breakdown.
- [x] **Verification**:
    - [x] Manual E2E test on Testnet.

## v2: Improvements (Next Steps)
- [ ] **Refund Logic**: Implement and verify refund mechanism for expired/cancelled escrows.
- [ ] **Release UI**: Create a frontend interface for the Admin/Deployer to release funds (replacing CLI).
- [ ] **Multi-token Support**: Expand beyond XLM/USDC to arbitrary assets.
- [ ] **Production Deployment**: Deploy to Stellar Mainnet.
- [ ] **CI/CD**: Setup GitHub Actions for automated testing and deployment.
