---
description: Fund buyer with USDC for testing deposits
---
# Fund Buyer with USDC

## Prerequisites
- buyer account created and funded with XLM
- USDC trustline established

## Steps

// turbo
1. Add USDC trustline (if not already done):
```bash
stellar tx new change-trust \
  --source buyer \
  --line USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 \
  --network testnet \
  --build-only \
  | stellar tx sign --sign-with-key buyer --network testnet \
  | stellar tx send --network testnet
```

// turbo
2. Swap XLM for 150 USDC:
```bash
# Note: Amounts are in STROOPS (1 unit = 10^7 stroops)
# 150 USDC = 1,500,000,000 stroops
stellar tx new path-payment-strict-receive \
  --source buyer \
  --send-asset native \
  --send-max 20000000000 \
  --dest-asset USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 \
  --dest-amount 1500000000 \
  --destination buyer \
  --network testnet \
  --build-only \
  | stellar tx sign --sign-with-key buyer --network testnet \
  | stellar tx send --network testnet
```

// turbo
3. Verify balance:
```bash
curl -s "https://horizon-testnet.stellar.org/accounts/$(stellar keys address buyer)" | python3 -c "import sys, json; data=json.load(sys.stdin); [print(f\"{b.get('asset_code', 'XLM')}: {float(b['balance']):.7f}\") for b in data['balances']]"
```
