---
description: Show balances for a named account (defaults to buyer)
---

# Show Funds

## Usage

Run with an account name argument (default: buyer).

## Steps

//turbo

1. Check balances:

```bash
# Set account name (default to 'buyer' if not provided)
ACCOUNT_NAME="${1:-buyer}"

# Get address
ADDRESS=$(stellar keys address $ACCOUNT_NAME)
echo "Account: $ACCOUNT_NAME ($ADDRESS)"

# Fetch and format balances
curl -s "https://horizon-testnet.stellar.org/accounts/$ADDRESS" | python3 -c "import sys, json; data=json.load(sys.stdin); [print(f\"{b.get('asset_code', 'XLM')}: {float(b['balance']):.7f}\") for b in data.get('balances', [])]"
```
