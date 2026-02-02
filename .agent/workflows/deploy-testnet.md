---
description: Deploy payment_escrow contract to Testnet and initialize with current accounts
---
# Deploy Payment Escrow Contract

## Prerequisites
- Stellar CLI installed
- deployer, oracle accounts created and funded

## Steps

// turbo
1. Build the contract:
```bash
stellar contract build
```

// turbo
2. Deploy to testnet:
```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/payment_escrow.wasm \
  --source deployer \
  --network testnet \
  --alias payment_escrow_v2
```

// turbo
3. Initialize the contract:
```bash
stellar contract invoke \
  --id payment_escrow_v2 \
  --source deployer \
  --network testnet \
  -- \
  initialize \
  --admin $(stellar keys address deployer) \
  --fee_recipient $(stellar keys address oracle) \
  --reflector CAVLP5DH2GJPZMVO7IJY4CVOD5MWEFTJFVPD2YY2FQXOQHRGHK4D6HLP
```

4. Update frontend CONTRACT_ID in `frontend/src/services/soroban.ts` with the new contract address.
