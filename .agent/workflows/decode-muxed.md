---
description: Decode a Stellar Muxed Address (M...) to extract the Order ID
---

# Decode Muxed Address

This workflow decodes a Stellar Protocol 25 Muxed Address to reveal the embedded Order ID.

## Steps

// turbo

1. Run the decoder script in the frontend directory:

```bash
cd /home/bobbybones/src/git/bobbybones/stellar-payment-dapp/frontend && node -e "
const { MuxedAccount } = require('@stellar/stellar-sdk');
const mAddress = '$MUXED_ADDRESS';
try {
  const decoded = MuxedAccount.fromAddress(mAddress, '0');
  console.log('✅ Decoded Muxed Address');
  console.log('   Base G Address:', decoded.baseAccount().accountId());
  console.log('   Order ID:', decoded.id());
} catch (e) {
  console.log('❌ Error:', e.message);
}
"
```

Replace `$MUXED_ADDRESS` with the M... address provided by the user.

## Example

For address `MDI3YDYQLYIHFLW2CV6PGLB2PYW2DVGYXDO3TUEW7FJ7X6MI2F7NUAAAAAAAAAAAU4ZDM`:

- **Base Address**: `GDI3YDYQLYIHFLW2CV6PGLB2PYW2DVGYXDO3TUEW7FJ7X6MI2F7NUV7S` (Oracle Pool)
- **Order ID**: `167`
