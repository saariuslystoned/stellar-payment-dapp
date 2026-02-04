---
description: Fund a Stellar account using the Testnet Friendbot
---

# Fund Account with Friendbot

## Usage

Run with an account name argument (default: `buyer`).

## Steps

// turbo

1. Fund the account:

```bash
ACCOUNT_NAME="${1:-buyer}"
echo "Requesting Friendbot funding for account: $ACCOUNT_NAME"
stellar keys fund "$ACCOUNT_NAME" --network testnet
```
