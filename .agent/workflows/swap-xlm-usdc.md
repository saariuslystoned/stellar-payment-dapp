---
description: Swap XLM for USDc for the requested account name
---

# Swap XLM to USDC

## Usage

Run with an account name argument (default: buyer).

## Steps

// turbo

1. Swap XLM for 1000 USDC:

```bash
ACCOUNT_NAME="${1:-buyer}"
# Note: Amounts are in STROOPS (1 unit = 10^7 stroops)
# 1000 USDC = 10,000,000,000 stroops
# Limit max XLM spent to 8000 (80,000,000,000 stroops)
stellar tx new path-payment-strict-receive \
  --source "$ACCOUNT_NAME" \
  --send-asset native \
  --send-max 80000000000 \
  --dest-asset USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 \
  --dest-amount 10000000000 \
  --destination "$ACCOUNT_NAME" \
  --network testnet \
  --build-only \
  | stellar tx sign --sign-with-key "$ACCOUNT_NAME" --network testnet \
  | stellar tx send --network testnet
```

// turbo 2. Verify balance:

```bash
ACCOUNT_NAME="${1:-buyer}"
curl -s "https://horizon-testnet.stellar.org/accounts/$(stellar keys address $ACCOUNT_NAME)" | python3 -c "import sys, json; data=json.load(sys.stdin); [print(f\"{b.get('asset_code', 'XLM')}: {float(b['balance']):.7f}\") for b in data['balances']]"
```
