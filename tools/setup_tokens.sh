#!/bin/bash
set -e

# Configuration
NETWORK="testnet"
SMOKY_SUPPLY="100000000"
SMOKY_FOUNDER_AMOUNT="51000000"
SMOKY_PUBLIC_AMOUNT="49000000"

echo "🚀 Starting Token Setup on $NETWORK..."

# 1. Generate Accounts
echo "🔑 Generating keys..."
if ! stellar keys address smoky-issuer > /dev/null 2>&1; then
    stellar keys generate smoky-issuer --network $NETWORK
    stellar keys generate zmoke-issuer --network $NETWORK
    stellar keys generate founder --network $NETWORK
    stellar keys generate public-distributor --network $NETWORK
fi

SMOKY_ISSUER=$(stellar keys address smoky-issuer)
ZMOKE_ISSUER=$(stellar keys address zmoke-issuer)
FOUNDER=$(stellar keys address founder)
DISTRIBUTOR=$(stellar keys address public-distributor)

echo "   SMOKY Issuer: $SMOKY_ISSUER"
echo "   ZMOKE Issuer: $ZMOKE_ISSUER"
echo "   Founder:      $FOUNDER"
echo "   Distributor:  $DISTRIBUTOR"

# 2. Fund Accounts
echo "💰 Funding accounts (this may take a moment)..."
stellar keys fund smoky-issuer --network $NETWORK
stellar keys fund zmoke-issuer --network $NETWORK
stellar keys fund founder --network $NETWORK
stellar keys fund public-distributor --network $NETWORK

# 3. Establish Trustlines
echo "🤝 Establishing trustlines..."
# Founder trusts SMOKY
stellar tx new change-trust \
    --source founder \
    --line SMOKY:$SMOKY_ISSUER \
    --limit $SMOKY_SUPPLY \
    --network $NETWORK \
    --build-only \
    | stellar tx sign --sign-with-key founder --network $NETWORK \
    | stellar tx send --network $NETWORK > /dev/null

# Distributor trusts SMOKY
stellar tx new change-trust \
    --source public-distributor \
    --line SMOKY:$SMOKY_ISSUER \
    --limit $SMOKY_SUPPLY \
    --network $NETWORK \
    --build-only \
    | stellar tx sign --sign-with-key public-distributor --network $NETWORK \
    | stellar tx send --network $NETWORK > /dev/null

# 4. Mint SMOKY
echo "minting SMOKY..."
# Send 51M to Founder
stellar tx new payment \
    --source smoky-issuer \
    --amount $SMOKY_FOUNDER_AMOUNT \
    --asset SMOKY:$SMOKY_ISSUER \
    --destination $FOUNDER \
    --network $NETWORK \
    --build-only \
    | stellar tx sign --sign-with-key smoky-issuer --network $NETWORK \
    | stellar tx send --network $NETWORK > /dev/null

# Send 49M to Distributor
stellar tx new payment \
    --source smoky-issuer \
    --amount $SMOKY_PUBLIC_AMOUNT \
    --asset SMOKY:$SMOKY_ISSUER \
    --destination $DISTRIBUTOR \
    --network $NETWORK \
    --build-only \
    | stellar tx sign --sign-with-key smoky-issuer --network $NETWORK \
    | stellar tx send --network $NETWORK > /dev/null

echo "✅ SMOKY Distributed: 51M to Founder, 49M to Distributor"

# 5. Lock SMOKY Issuer
echo "🔒 Locking SMOKY issuer account..."
stellar tx new set-options \
    --source smoky-issuer \
    --master-weight 0 \
    --network $NETWORK \
    --build-only \
    | stellar tx sign --sign-with-key smoky-issuer --network $NETWORK \
    | stellar tx send --network $NETWORK > /dev/null

echo "✅ SMOKY Issuer Locked"

# 6. Summary
echo "---------------------------------------------------"
echo "🎉 Setup Complete!"
echo "SMOKY Asset: SMOKY:$SMOKY_ISSUER"
echo "ZMOKE Asset: ZMOKE:$ZMOKE_ISSUER"
echo "---------------------------------------------------"
