---
description: Get the secret S... key for a named Stellar account
---

# Get Secret Key (S...)

Retrieves the secret key for a Stellar account stored in the local keystore.

## Usage

// turbo
Run the following command, replacing `$ACCOUNT_NAME` with the account name (e.g., `buyer`, `seller`, `oracle`):

```bash
stellar keys show $ACCOUNT_NAME
```

## Available Accounts

Run `stellar keys ls` to see all available account names.

> ⚠️ **Security**: Never share secret keys or commit them to version control.
