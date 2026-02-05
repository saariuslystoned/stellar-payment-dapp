# Task: ZMOKE Spending Integration Design

## Planning & Design
- [ ] Create `docs/design_zmoke_spending.md` with:
    - [ ] Wallet Linkage Architecture (User Meta + Signature Verification)
    - [ ] Balance Retrieval Strategy (Backend Proxy vs Client-side)
    - [ ] "Burn-to-Coupon" Transaction Flow for Accounting Accuracy
    - [ ] Security Considerations (Replay attacks, Whale spoofing)
- [/] Review current WooCommerce Backend API capabilities (`backend/woocommerce.go`)

## Implementation (Future)
- [ ] Implement `POST /api/link-wallet` in Go Backend
- [ ] Implement `POST /api/redeem-zmoke` in Go Backend (Gen Coupon)
- [ ] Update Frontend/WordPress Theme to call these endpoints
