import time
import struct
from stellar_sdk import Keypair, strkey

# --- Configuration ---
# REPLACE THESE WITH YOUR VALUES
# 1. The Oracle's Secret Key (S...)
ORACLE_SECRET = "SDOT...YOUR_ORACLE_SECRET_KEY_HERE" 

# 2. The Contract ID (C...) from deployment
CONTRACT_ID = "CD..." 

# 3. Quote Details
PRICE = 10000000000 # 1000 XLM (in stroops) or 1:1 if handling logic differs. 
                    # For V1: Price is "Amount of Token B needed to buy Token A" or similar.
                    # Adjust based on your specific contract logic constants.
                    # Default assumption: 1:1 representation or fixed quote.
TIMESTAMP = int(time.time())

def sign_quote():
    try:
        kp = Keypair.from_secret(ORACLE_SECRET)
    except Exception as e:
        print(f"Error: Invalid Oracle Secret Key. Please update ORACLE_SECRET in the script. ({e})")
        return

    try:
        contract_bytes = strkey.DecodeError.decode_check("contract", CONTRACT_ID)
    except:
        # Fallback if it's a hex string (unlikely for "C..." addresses but possible for raw bytes)
        try:
            contract_bytes = bytes.fromhex(CONTRACT_ID)
        except:
             # Fallback: decode directly if it's a strkey
             contract_bytes = strkey.decode_check("contract", CONTRACT_ID)

    # Payload Structure: 
    # Symbol (String/Bytes) ? No, usually in Soroban we sign the Hash of the args or a specific struct.
    # Architecture from specs: 
    # "Oracle signs: (Price, Timestamp, ContractID)"
    # Let's assume standard XDR encoding or simple concatenation if that's what was implemented.
    # Reconstructing likely implementation:
    # 1. Price (i128 or u64)
    # 2. Timestamp (u64)
    # 3. Contract ID (32 bytes)
    
    # Python struct packing (Big Endian standard for network/crypto)
    # Ref: Rust i128 is 16 bytes. python struct doesn't strictly support i128 native in older versions well,
    # but we can do manual byte conversion.
    
    price_bytes = PRICE.to_bytes(16, byteorder='big', signed=True) # i128
    timestamp_bytes = TIMESTAMP.to_bytes(8, byteorder='big')       # u64
    
    # Message = ContractID || Price || Timestamp
    # This binds the signature to THIS contract instance specifically.
    message = contract_bytes + price_bytes + timestamp_bytes
    
    signature = kp.sign(message)
    
    print("\n=== Oracle Quote generated ===")
    print(f"Price:     {PRICE}")
    print(f"Timestamp: {TIMESTAMP}")
    print(f"Signature: {signature.hex()}")
    print("==============================\n")

if __name__ == "__main__":
    sign_quote()
