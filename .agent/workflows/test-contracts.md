---
description: Run the full test suite for a specific contract package
---

1. Navigate to project root
cd /home/bobbybones/src/git/bobbybones/stellar-payment-dapp

2. Run cargo test (replace [PACKAGE_NAME])
// turbo
cargo test -p [PACKAGE_NAME]

3. Run full workspace test
// turbo
cargo test --workspace
