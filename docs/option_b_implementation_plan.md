# Option B Implementation Plan: Direct Contract Deposits + MSM + Blend

> **Decision**: Abandon Muxed Address approach. Use direct contract deposits for trustless custody with Blend yield and MSM batch verification.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        OPTION B FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  DEPOSIT (Per Order):                                           │
│    Buyer → contract.deposit(order_id, token, amount)            │
│         → Contract holds custody                                │
│         → Backend notifies WooCommerce                          │
│         → ZMOKE rewards distributed                             │
│                                                                 │
│  YIELD (Async):                                                 │
│    Backend calls contract.supply_to_blend()                     │
│         → Contract supplies to Blend Pool                       │
│         → Contract holds bTokens (yield-bearing)                │
│                                                                 │
│  SETTLEMENT (Batched with ZK - Future):                         │
│    Backend generates ZK proof off-chain (Poseidon Merkle tree)  │
│         → contract.settle_batch(proof, commitments)             │
│         → Contract uses bn254_g1_msm() to verify                │
│         → Blend withdraw → Seller (98%), Platform (2%)          │
│                                                                 │
│  SETTLEMENT (Simple - MVP):                                     │
│    Backend calls contract.settle()                              │
│         → Calculate 98% (Seller) vs 2% (Fee)                    │
│         → Blend withdraw ONLY Seller's share (98%)              │
│         → Pay Seller                                            │
│         → 2% Fee remains in Blend (compounding yield)           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Why Option B Over Muxed (Option A)

| Factor | Muxed (Option A) | Direct Contract (Option B) |
|--------|------------------|---------------------------|
| **Deposit UX** | Simple payment | Contract invocation |
| **Custody** | Oracle Pool (custodial) | Contract (trustless) |
| **Blend Integration** | Extra hop required | Native |
| **ZK/MSM Settlement** | Off-chain records | On-chain state proof |
| **Public Plugin Trust** | Requires merchant trust | Fully auditable |

**Decision Rationale**: For a public plugin, trustless custody via contract is essential. The slight UX cost of contract invocation is worth the trust and Blend integration benefits.

---

## Pool Contract Updates Required

The existing `contracts/pool_contract/` needs these modifications:

### 1. Change `record_deposit` → `deposit` (with actual token transfer)

```rust
// OLD: record_deposit (just tracking)
pub fn record_deposit(env: Env, token: Address, amount: i128, order_id: u64)

// NEW: deposit (buyer calls directly, transfers tokens to contract)
pub fn deposit(env: Env, buyer: Address, token: Address, amount: i128, order_id: u64) {
    buyer.require_auth();  // Buyer must sign
    
    // Transfer tokens FROM buyer TO contract
    let client = token::Client::new(&env, &token);
    client.transfer(&buyer, &env.current_contract_address(), &amount);
    
    // Track deposit
    // ... existing logic ...
}
```

### 2. Add order tracking map (for MSM later)

```rust
#[contracttype]
pub struct Deposit {
    pub buyer: Address,
    pub token: Address,
    pub amount: i128,
    pub timestamp: u64,
}

// Store: Map<u64, Deposit> keyed by order_id
```

### 3. Remove muxed-specific comments

Current comments reference muxed routing - update to reflect direct deposits.

---

## Phase Breakdown

### Phase 1: Contract MVP (Week 1)
- [x] Pool Contract with Blend hooks (DONE - deployed)
- [ ] Update `deposit()` to accept buyer-signed transfers
- [ ] Add order tracking map
- [ ] Redeploy to Testnet

### Phase 2: Frontend Integration (Week 1-2)
- [ ] Update `DepositForm.tsx` to call `contract.deposit()`
- [ ] Replace Albedo payment with Soroban contract invocation
- [ ] Update `soroban.ts` with deposit helper

### Phase 3: Backend Integration (Week 2)
- [ ] Watch contract events for deposit confirmation
- [ ] Trigger WooCommerce status update on deposit
- [ ] Implement settlement trigger (`contract.settle()`)

### Phase 4: Blend Integration (Week 2-3)
- [ ] Connect to Blend Testnet Pool (`CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF`)
- [ ] Implement actual `supply_to_blend()` Blend calls
- [ ] Implement `withdraw_from_blend()` for settlement

### Phase 5: MSM Batch Settlement (Q2 2026 - Protocol 26)
- [ ] Implement Poseidon hash tree for deposits (CAP-0075)
- [ ] Build ZK prover (off-chain, Go)
- [ ] Add `settle_batch(proof, commitments)` to contract
- [ ] Use `bn254_g1_msm()` for O(1) verification (CAP-0080)

---

## Testnet Coordinates (Preserved)

| Contract | Address |
|----------|---------|
| **Pool Contract** | `CDZUDUHZPJ7OC72CEXHK5JIGIZWXWZBOTXI2MK5MGTF5O3WDREBPTNFS` |
| **Blend Pool (TestnetV2)** | `CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF` |
| **USDC Token** | `CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU` |
| **XLM (SAC)** | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| **Backstop V2** | `CBDVWXT433PRVTUNM56C3JREF3HIZHRBA64NB2C3B2UNCKIS65ZYCLZA` |

---

## Rollback Instructions

### Step 1: Backup Pool Contract (Already Done)
```bash
# Pool contract backed up to /tmp/pool_contract_backup/
```

### Step 2: Rollback Git to Last Commit
```bash
cd /home/bobbybones/src/git/bobbybones/stellar-payment-dapp
git checkout -- .  # Discard all uncommitted changes
git clean -fd      # Remove untracked files/directories
```

### Step 3: Restore Pool Contract
```bash
cp -r /tmp/pool_contract_backup contracts/pool_contract
```

### Step 4: Copy This Implementation Plan
```bash
mkdir -p docs
# Save this plan as docs/option_b_implementation_plan.md
```

### Step 5: Preserve CAP Docs (Optional)
The CAP docs (cap-0075.md, cap-0079.md, cap-0080.md) are useful references - keep them.

---

## Files to Preserve After Rollback

| File | Reason |
|------|--------|
| `contracts/pool_contract/` | Deployed contract with Blend hooks |
| `docs/cap-0075.md` | Poseidon hash reference |
| `docs/cap-0080.md` | MSM reference |
| `docs/option_b_implementation_plan.md` | This plan |

## Files Discarded by Rollback

| File/Dir | Reason |
|----------|--------|
| `frontend/src/utils/muxed.ts` | Not needed for Option B |
| `backend/settlement.go` (muxed parts) | Will rewrite for contract calls |
| `.agent/workflows/decode-muxed.md` | Not needed |
| `docs/v2_transition_plan.md` | Outdated - replaced by this plan |

---

## Next Steps After Rollback

1. **Review this plan** and confirm approach
2. **Update pool contract** with `deposit()` function
3. **Update frontend** to use contract invocation instead of payment
4. **Test deposit flow** on Testnet
5. **Implement Blend integration** with real calls
