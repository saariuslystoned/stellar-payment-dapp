---
description: Query the pool contract's position in the Blend TESTNETv2 pool (supply, collateral, liabilities)
---

# Check Blend Position

Query the Blend TESTNETv2 pool to see the pool contract's current supply position and claimable BLND emissions.

## Key Addresses

- **Pool Contract**: `CCHVVL26PYRYRJR4OXEEAHNHMP6OAPEJT26EZRZXVDYL3HWHCD5SEDON`
- **Blend Pool (TESTNETv2)**: `CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF`
- **BackstopV2**: `CBDVWXT433PRVTUNM56C3JREF3HIZHRBA64NB2C3B2UNCKIS65ZYCLZA`
- **Emitter**: `CC3WJVJINN4E3LPMNTWKK7LQZLYDQMZHZA7EZGXATPHHBPKNZRIO3KZ6`

## Reserve Index Mapping

| Index | Token | Address | Emission Index (supply) |
|-------|-------|---------|------------------------|
| 0 | XLM (native) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` | 1 (supply) / 0 (borrow) |
| 1 | wETH | `CAZAQB3D7KSLSNOSQKYD2V4JP5V2Y3B4RDJZRLBFCCIXDCTE3WHSY3UE` | 3 / 2 ✅ borrow |
| 2 | wBTC | `CAP5AMC2OHNVREO66DFIN6DHJMPOBAJ2KCDDIMFBR7WWJH5RZBFM3UEI` | 5 ✅ supply / 4 |
| 3 | Blend USDC | `CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU` | 7 / 6 ✅ borrow |

Emission index formula: `reserve_index * 2` = **borrow** (dTokens), `reserve_index * 2 + 1` = **supply** (bTokens)

Active emissions: wETH borrow (2), wBTC supply (5), USDC borrow (6). Only wBTC supply earns BLND for suppliers.

## Steps

### 1. Query Blend Position & Emissions

// turbo
Run both queries to get positions and USDC supply emissions in one shot:

```bash
echo "=== BLEND POSITIONS ===" && \
stellar contract invoke \
  --id CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF \
  --source deployer --network testnet --send=no \
  -- get_positions \
  --address CCHVVL26PYRYRJR4OXEEAHNHMP6OAPEJT26EZRZXVDYL3HWHCD5SEDON && \
echo "=== CLAIMABLE BLND (wBTC supply, index 5 — only supply emission) ===" && \
stellar contract invoke \
  --id CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF \
  --source deployer --network testnet --send=no \
  -- get_user_emissions \
  --reserve_token_index 5 \
  --user CCHVVL26PYRYRJR4OXEEAHNHMP6OAPEJT26EZRZXVDYL3HWHCD5SEDON && \
echo "=== CLAIMABLE BLND (USDC borrow, index 6 — only if borrowing) ===" && \
stellar contract invoke \
  --id CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF \
  --source deployer --network testnet --send=no \
  -- get_user_emissions \
  --reserve_token_index 6 \
  --user CCHVVL26PYRYRJR4OXEEAHNHMP6OAPEJT26EZRZXVDYL3HWHCD5SEDON
```

### 2. Interpret Results

Present the output as:

```
BLEND USDC POSITION : <supply key "3" value / 10_000_000>
XLM POSITION        : <supply key "0" value / 10_000_000>
CLAIMABLE BLND      : <sum of accrued from both get_user_emissions calls / 10_000_000>
```

- **supply** map: Key `0` = XLM, Key `3` = Blend USDC (bToken amounts)
- **get_user_emissions** returns `{"accrued": <amount>, "index": <value>}` — the `accrued` field is claimable BLND in stroops
- All amounts are in stroops (7 decimal places), divide by 10,000,000

### 3. (Optional) Refresh Emissions

If emissions show as expired or zero, run the 3-step pipeline to refresh (anyone can call these):

```bash
# Step 1: Emitter distribute
stellar contract invoke --id CC3WJVJINN4E3LPMNTWKK7LQZLYDQMZHZA7EZGXATPHHBPKNZRIO3KZ6 \
  --source deployer --network testnet -- distribute

# Step 2: Backstop distribute
stellar contract invoke --id CBDVWXT433PRVTUNM56C3JREF3HIZHRBA64NB2C3B2UNCKIS65ZYCLZA \
  --source deployer --network testnet -- distribute

# Step 3: Pool gulp_emissions
stellar contract invoke --id CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF \
  --source deployer --network testnet -- gulp_emissions
```
