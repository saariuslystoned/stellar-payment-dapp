import {
    Contract,
    TransactionBuilder,
    TimeoutInfinite,
    rpc,
    nativeToScVal
} from '@stellar/stellar-sdk';
import albedo from '@albedo-link/intent';

// Pool Contract (Option B) - auto-supplies to Blend after deposits
// Initialized with Private Blend Environment USDC: CDNZ...
const POOL_CONTRACT_ID = 'CBCMYJWUHSFJWQ2ZACB2JQMA3SBI47R2HVTG3KSVU5IRW4NBA2RZL6H7';


// Backend URL for price API
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

// Native XLM Contract on Testnet (Wrapped)
export const NATIVE_TOKEN_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
// Private Blend Testnet USDC (Deployed via mock-example.js)
export const TOKEN_ID = 'CDNZ44UBKS56UG4SKDZ656T4A23EJDX2ZCTKIYNA25KGD33GS2GCLQFH';

const server = new rpc.Server('https://soroban-testnet.stellar.org:443');

// Price response type from backend
export interface PriceData {
    xlm_per_usd: number;
    price_usd: number;
    timestamp: number;
}

export const soroban = {
    /**
     * Fetch live XLM/USD price from Reflector Oracle via backend
     * THROWS if price unavailable - no fallback for production safety
     */
    async getXlmPrice(): Promise<PriceData> {
        const res = await fetch(`${BACKEND_URL}/price/xlm`, {
            headers: {
                // Required to bypass ngrok's interstitial page on free tier
                // Backend CORS is configured to allow this header
                'ngrok-skip-browser-warning': 'true'
            }
        });
        if (!res.ok) {
            const errorText = await res.text().catch(() => 'Unknown error');
            throw new Error(`Oracle unavailable: ${res.status} - ${errorText}`);
        }

        // Check if we got HTML (ngrok interstitial) instead of JSON
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error('Backend returned non-JSON response (ngrok interstitial?)');
        }

        const data = await res.json();
        // Validate the price data
        if (!data.xlm_per_usd || data.xlm_per_usd <= 0 || !data.price_usd || data.price_usd <= 0) {
            throw new Error('Invalid price data from oracle');
        }
        return data;
    },

    /**
     * @deprecated Use getXlmPrice() instead
     */
    async getReflectorPrice(_tokenAddress: string): Promise<number> {
        void _tokenAddress;
        const priceData = await this.getXlmPrice();
        return priceData.xlm_per_usd;
    },

    /**
     * Deposit funds to Pool Contract for an order
     * New Option B flow: buyer signs contract invocation directly
     * 
     * @param buyerAddress - Buyer's Stellar public key (G...)
     * @param amount - Token amount as string (e.g., "10.50")
     * @param orderId - WooCommerce order ID for tracking
     * @param tokenAddress - Token contract address (defaults to XLM)
     */
    async deposit(
        buyerAddress: string,
        amount: string,
        orderId: number,
        tokenAddress: string = NATIVE_TOKEN_ID
    ) {
        // 1. Get Account
        const account = await server.getAccount(buyerAddress);

        // 2. Convert amount to stroops (7 decimals)
        const tokenAmountStroops = Math.floor(parseFloat(amount) * 10_000_000);

        // 3. Build Transaction - New Pool Contract signature:
        //    deposit(buyer: Address, token: Address, amount: i128, order_id: u64)
        const contract = new Contract(POOL_CONTRACT_ID);

        const op = contract.call('deposit',
            nativeToScVal(buyerAddress, { type: 'address' }),      // buyer
            nativeToScVal(tokenAddress, { type: 'address' }),      // token
            nativeToScVal(BigInt(tokenAmountStroops), { type: 'i128' }), // amount
            nativeToScVal(BigInt(orderId), { type: 'u64' })        // order_id
        );

        let tx = new TransactionBuilder(account, { fee: '1000' })
            .addOperation(op)
            .setTimeout(TimeoutInfinite)
            .setNetworkPassphrase("Test SDF Network ; September 2015")
            .build();

        // Prepare transaction (calculate resources & fees)
        tx = await server.prepareTransaction(tx);

        const xdrTx = tx.toXDR();

        // 4. Sign with Albedo
        const res = await albedo.tx({
            xdr: xdrTx,
            network: 'testnet',
            submit: false
        });

        // 5. Submit
        const result = await server.sendTransaction(
            TransactionBuilder.fromXDR(res.signed_envelope_xdr, "Test SDF Network ; September 2015")
        );

        if (result.status !== 'PENDING') {
            console.error("Tx Result", result);
            throw new Error(`Transaction failed: ${result.status}`);
        }

        // 6. Wait for transaction confirmation
        console.log("Waiting for transaction confirmation...");
        let txResult = await server.getTransaction(result.hash);

        while (txResult.status === 'NOT_FOUND') {
            await new Promise(resolve => setTimeout(resolve, 1000));
            txResult = await server.getTransaction(result.hash);
        }

        if (txResult.status === 'FAILED') {
            throw new Error('Transaction failed after submission');
        }

        // Return transaction hash (no escrow_id in new flow, order_id is used instead)
        return { tx_hash: result.hash, order_id: orderId };
    },

    async releaseEscrow(escrowId: number, adminAddress: string) {
        const account = await server.getAccount(adminAddress);
        const contract = new Contract(POOL_CONTRACT_ID);
        const op = contract.call('release', nativeToScVal(escrowId, { type: 'u64' }));

        let tx = new TransactionBuilder(account, { fee: '1000' })
            .addOperation(op)
            .setTimeout(TimeoutInfinite)
            .setNetworkPassphrase("Test SDF Network ; September 2015")
            .build();

        tx = await server.prepareTransaction(tx);

        // In a real verification tool, this would need the Admin to sign.
        // For the frontend, we just prepare it.
        return tx.toXDR();
    },

    /**
     * Create a trustline for ZMOKE token so buyer can receive rewards
     */
    async createZmokeTrustline(buyerAddress: string): Promise<string> {
        const { Asset, Operation, Horizon, TransactionBuilder: ClassicBuilder } = await import('@stellar/stellar-sdk');

        const horizonServer = new Horizon.Server('https://horizon-testnet.stellar.org');
        const account = await horizonServer.loadAccount(buyerAddress);

        // ZMOKE Issuer from keys.md
        const ZMOKE_ISSUER = 'GC3V72IIUGZWHXI3AV3P7TAHYX7SLSX7HHXD7ERD33NQV3OFGED4GW7L';
        const zmokeAsset = new Asset('ZMOKE', ZMOKE_ISSUER);

        const tx = new ClassicBuilder(account, { fee: '100' })
            .addOperation(Operation.changeTrust({
                asset: zmokeAsset,
                limit: '10000000000' // High limit for rewards
            }))
            .setTimeout(30)
            .setNetworkPassphrase("Test SDF Network ; September 2015")
            .build();

        // Sign with Albedo
        const res = await albedo.tx({
            xdr: tx.toXDR(),
            network: 'testnet',
            submit: true // Submit directly
        });

        return res.tx_hash;
    },

    /**
     * Burn ZMOKE tokens by sending them to the Treasury address
     * This is used for the "Redeem for Store Credit" flow
     * 
     * @param senderAddress - User's Stellar public key
     * @param amount - ZMOKE amount to burn as string (e.g., "100.00")
     * @param treasuryAddress - Treasury address that receives the "burned" tokens
     * @returns Transaction hash
     */
    async burnZmokeForCredit(senderAddress: string, amount: string, treasuryAddress: string): Promise<string> {
        const { Asset, Operation, Horizon, TransactionBuilder: ClassicBuilder } = await import('@stellar/stellar-sdk');

        const horizonServer = new Horizon.Server('https://horizon-testnet.stellar.org');
        const account = await horizonServer.loadAccount(senderAddress);

        // ZMOKE Issuer from keys.md
        const ZMOKE_ISSUER = 'GC3V72IIUGZWHXI3AV3P7TAHYX7SLSX7HHXD7ERD33NQV3OFGED4GW7L';
        const zmokeAsset = new Asset('ZMOKE', ZMOKE_ISSUER);

        const tx = new ClassicBuilder(account, { fee: '100' })
            .addOperation(Operation.payment({
                destination: treasuryAddress,
                asset: zmokeAsset,
                amount: amount
            }))
            .setTimeout(30)
            .setNetworkPassphrase("Test SDF Network ; September 2015")
            .build();

        // Sign with Albedo
        const res = await albedo.tx({
            xdr: tx.toXDR(),
            network: 'testnet',
            submit: true
        });

        return res.tx_hash;
    }
};
