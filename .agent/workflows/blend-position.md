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
Run the query and format results into a human-readable dashboard:

```bash
# Fetch Positions
POSITIONS=$(stellar contract invoke \
  --id CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF \
  --source deployer --network testnet --send=no \
  -- get_positions \
  --address CCHVVL26PYRYRJR4OXEEAHNHMP6OAPEJT26EZRZXVDYL3HWHCD5SEDON 2>/dev/null)

# Fetch Reserve Data for APY Calculation
# XLM (Index 0)
RESERVE_XLM=$(stellar contract invoke \
  --id CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF \
  --source deployer --network testnet --send=no \
  -- get_reserve \
  --asset CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC 2>/dev/null)

# USDC (Index 3)
RESERVE_USDC=$(stellar contract invoke \
  --id CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF \
  --source deployer --network testnet --send=no \
  -- get_reserve \
  --asset CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU 2>/dev/null)

# Fetch Emissions
EMIT_WBTC=$(stellar contract invoke \
  --id CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF \
  --source deployer --network testnet --send=no \
  -- get_user_emissions \
  --reserve_token_index 5 \
  --user CCHVVL26PYRYRJR4OXEEAHNHMP6OAPEJT26EZRZXVDYL3HWHCD5SEDON 2>/dev/null)

EMIT_USDC=$(stellar contract invoke \
  --id CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF \
  --source deployer --network testnet --send=no \
  -- get_user_emissions \
  --reserve_token_index 6 \
  --user CCHVVL26PYRYRJR4OXEEAHNHMP6OAPEJT26EZRZXVDYL3HWHCD5SEDON 2>/dev/null)

python3 -c "
import json, sys, math

def load_json_resilient(raw):
    try:
        if not raw: return {}
        start_idx = raw.find('{')
        if start_idx == -1: return {}
        return json.loads(raw[start_idx:])
    except: return {}

def get_reserve_info(reserve_json):
    '''Returns (supply_apy, b_rate) tuple'''
    try:
        if not reserve_json or 'error' in reserve_json.lower(): return (0.0, 1.0)
        start_idx = reserve_json.find('{')
        if start_idx == -1: return (0.0, 1.0)
        res = json.loads(reserve_json[start_idx:])
        config = res.get('config', {})
        data = res.get('data', {})
        SCALAR = 1e7
        b_rate = float(data.get('b_rate', 1e12)) / 1e12
        b_supply = float(data.get('b_supply', 0))
        d_supply = float(data.get('d_supply', 0))
        if b_supply == 0: return (0.0, b_rate)
        utilization = d_supply / b_supply
        r_base = float(config.get('r_base', 0)) / SCALAR
        r_one = float(config.get('r_one', 0)) / SCALAR
        r_two = float(config.get('r_two', 0)) / SCALAR
        r_three = float(config.get('r_three', 0)) / SCALAR
        target_util = float(config.get('util', 0)) / SCALAR
        max_util = float(config.get('max_util', 0)) / SCALAR
        rate = 0.0
        if utilization <= target_util:
            rate = r_base + (utilization / target_util) * r_one
        elif utilization <= max_util:
            rate = r_base + r_one + ((utilization - target_util) / (1 - target_util)) * r_two
        else:
            rate = r_base + r_one + r_two + r_three
        ir_mod = float(data.get('ir_mod', 0)) / SCALAR
        borrow_apr = rate * ir_mod
        supply_apr = borrow_apr * utilization
        if supply_apr == 0: return (0.0, b_rate)
        supply_apy = (math.exp(supply_apr) - 1) * 100
        return (supply_apy, b_rate)
    except:
        return (0.0, 1.0)

pos_raw = r'''\$POSITIONS'''
xlm_res_raw = r'''\$RESERVE_XLM'''
usdc_res_raw = r'''\$RESERVE_USDC'''
emit_wbtc_raw = r'''\$EMIT_WBTC'''.strip()
emit_usdc_raw = r'''\$EMIT_USDC'''.strip()

pos = load_json_resilient(pos_raw)
xlm_apy, xlm_b_rate = get_reserve_info(xlm_res_raw)
usdc_apy, usdc_b_rate = get_reserve_info(usdc_res_raw)

supply = pos.get('supply', {})
collateral = pos.get('collateral', {})
liabilities = pos.get('liabilities', {})

# bToken amounts (raw position)
xlm_s  = int(supply.get('0', 0)) / 1e7
xlm_c  = int(collateral.get('0', 0)) / 1e7
usdc_s = int(supply.get('3', 0)) / 1e7
usdc_c = int(collateral.get('3', 0)) / 1e7
xlm_l  = int(liabilities.get('0', 0)) / 1e7
usdc_l = int(liabilities.get('3', 0)) / 1e7

# Real underlying value = bTokens * b_rate
xlm_total_b = xlm_s + xlm_c
usdc_total_b = usdc_s + usdc_c
xlm_real = xlm_total_b * xlm_b_rate
usdc_real = usdc_total_b * usdc_b_rate
xlm_accrued = xlm_real - xlm_total_b
usdc_accrued = usdc_real - usdc_total_b

blnd = 0.0
for raw in [emit_wbtc_raw, emit_usdc_raw]:
    e = load_json_resilient(raw)
    if e:
        blnd += int(e.get('accrued', 0)) / 1e7

print()
print('╔══════════════════════════════════════════════════════════╗')
print('║             ⚡ BLEND POOL POSITION ⚡                  ║')
print('╠══════════════════════════════════════════════════════════╣')
print('║                                                          ║')
print(f'║  🪙  XLM (native)          {xlm_apy:>6.2f}% APY                ║')
if xlm_c > 0:
    print(f'║      Collateral (bTokens): {xlm_c:>12,.2f} XLM                ║')
if xlm_s > 0:
    print(f'║      Supply (bTokens):     {xlm_s:>12,.2f} XLM                ║')
if xlm_total_b > 0:
    print(f'║      Real Value:           {xlm_real:>12,.2f} XLM                ║')
    print(f'║      Interest Earned:      {xlm_accrued:>12,.4f} XLM   (+{xlm_accrued/xlm_total_b*100 if xlm_total_b else 0:.3f}%)  ║')
if xlm_l > 0:
    print(f'║      Liabilities:          {xlm_l:>12,.2f} XLM                ║')
if xlm_total_b == 0 and xlm_l == 0:
    print(f'║      (No position)                                     ║')
print('║                                                          ║')
print(f'║  💵  Blend USDC            {usdc_apy:>6.2f}% APY                ║')
if usdc_c > 0:
    print(f'║      Collateral (bTokens): {usdc_c:>12,.2f} USDC               ║')
if usdc_s > 0:
    print(f'║      Supply (bTokens):     {usdc_s:>12,.2f} USDC               ║')
if usdc_total_b > 0:
    print(f'║      Real Value:           {usdc_real:>12,.2f} USDC               ║')
    print(f'║      Interest Earned:      {usdc_accrued:>12,.4f} USDC  (+{usdc_accrued/usdc_total_b*100 if usdc_total_b else 0:.3f}%)  ║')
if usdc_l > 0:
    print(f'║      Liabilities:          {usdc_l:>12,.2f} USDC               ║')
if usdc_total_b == 0 and usdc_l == 0:
    print(f'║      (No position)                                     ║')
print('║                                                          ║')
print(f'║  🏆  Claimable BLND:       {blnd:>12,.4f}                      ║')
print('║                                                          ║')
print('╚══════════════════════════════════════════════════════════╝')
print()
"
```

### 2. Interpret Results

- **bTokens** = your raw position amount (stays constant)
- **Real Value** = bTokens × `b_rate` (grows over time as interest accrues)
- **Interest Earned** = Real Value − bTokens (the accumulated interest)
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
