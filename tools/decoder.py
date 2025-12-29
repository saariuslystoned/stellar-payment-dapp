
import sys
from stellar_sdk import strkey

if len(sys.argv) < 2:
    print("Usage: python3 decoder.py <G-ADDRESS>")
    sys.exit(1)

address = sys.argv[1]
try:
    # Decode the G-address (Ed25519 Public Key) to bytes, then hex
    pk_bytes = strkey.StrKey.decode_ed25519_public_key(address)
    print(pk_bytes.hex())
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
