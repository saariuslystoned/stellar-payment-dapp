#!/bin/bash
set -e

# Directory for keys
mkdir -p .keys

echo "🪙 Generating ZMOKE Token Keys..."

# 1. Generate Keys
if [ ! -f .keys/zmoke_issuer.key ]; then
    stellar keys generate --global zmoke_issuer --network testnet > .keys/zmoke_issuer.key
    echo "✅ Generated zmoke_issuer"
else
    echo "ℹ️ zmoke_issuer already exists"
fi

if [ ! -f .keys/zmoke_distributor.key ]; then
    stellar keys generate --global zmoke_distributor --network testnet > .keys/zmoke_distributor.key
    echo "✅ Generated zmoke_distributor"
else
    echo "ℹ️ zmoke_distributor already exists"
fi

ISSUER_ADDRESS=$(stellar keys address zmoke_issuer)
DISTRIBUTOR_ADDRESS=$(stellar keys address zmoke_distributor)

echo "Issuer: $ISSUER_ADDRESS"
echo "Distributor: $DISTRIBUTOR_ADDRESS"

# 2. Fund Accounts
echo -e "\n💰 Funding accounts on Testnet..."
curl -s "https://friendbot.stellar.org/?addr=$ISSUER_ADDRESS" > /dev/null
echo "✅ Funded Issuer"
curl -s "https://friendbot.stellar.org/?addr=$DISTRIBUTOR_ADDRESS" > /dev/null
echo "✅ Funded Distributor"

# 3. Establish Trustline (Distributor trusts Issuer for ZMOKE)
echo -e "\n🤝 Establishing Trustline..."
stellar tx new change-trust \
    --source zmoke_distributor \
    --line "ZMOKE:$ISSUER_ADDRESS" \
    --limit "10000000000" \
    --network testnet \
    --build-only > tx_trust.xdr

stellar tx sign tx_trust.xdr --sign-with-key zmoke_distributor --network testnet > tx_trust_signed.xdr
stellar tx send tx_trust_signed.xdr --network testnet > /dev/null
rm tx_trust.xdr tx_trust_signed.xdr
echo "✅ Distributor now trusts ZMOKE"

# 4. Mint Initial Batch to Distributor
BATCH_AMOUNT=1000000
echo -e "\n🏭 Minting Initial Batch ($BATCH_AMOUNT ZMOKE) to Distributor..."
stellar tx new payment \
    --source zmoke_issuer \
    --destination "$DISTRIBUTOR_ADDRESS" \
    --asset "ZMOKE:$ISSUER_ADDRESS" \
    --amount "$BATCH_AMOUNT" \
    --network testnet \
    --build-only > tx_mint.xdr

stellar tx sign tx_mint.xdr --sign-with-key zmoke_issuer --network testnet > tx_mint_signed.xdr
stellar tx send tx_mint_signed.xdr --network testnet > /dev/null
rm tx_mint.xdr tx_mint_signed.xdr
echo "✅ Minted $BATCH_AMOUNT ZMOKE to Distributor"

echo -e "\n🎉 Setup Complete!"
echo "---------------------------------------------------"
echo "ZMOKE_ISSUER_PUBLIC_KEY=$ISSUER_ADDRESS"
echo "ZMOKE_DISTRIBUTOR_SECRET=$(cat .keys/zmoke_distributor.key | grep "Secret key" | awk '{print $3}')"
echo "---------------------------------------------------"
echo "⚠️  SAVE THE ISSUER KEY SECURELY OFF-SERVER:"
cat .keys/zmoke_issuer.key
