---
description: Release funds from an escrow to the seller
---
# Release Escrow

## Prerequisites
- Escrow ID from a successful deposit
- deployer account (admin) access

## Steps

1. Release escrow funds (replace ESCROW_ID with actual ID):
```bash
stellar contract invoke \
  --id payment_escrow_v2 \
  --source deployer \
  --network testnet \
  -- \
  release \
  --escrow_id ESCROW_ID
```

2. Verify seller received funds:
```bash
curl -s "https://horizon-testnet.stellar.org/accounts/$(stellar keys address seller)" | python3 -c "import sys, json; data=json.load(sys.stdin); [print(f\"{b.get('asset_code', 'XLM')}: {float(b['balance']):.7f}\") for b in data['balances']]"
```

## Expected Result
- Seller receives 99% of escrowed amount
- Oracle receives 2% fee
