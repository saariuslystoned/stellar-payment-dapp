import {
    Contract,
    TransactionBuilder,
    TimeoutInfinite,
    rpc,
    nativeToScVal,
    scValToNative
} from '@stellar/stellar-sdk';
import albedo from '@albedo-link/intent';

// Contract ID on Testnet
const CONTRACT_ID = 'CDLLYK6JTLNNDEW3RGH2FNKKFLQLPSV64CGDFZK3WDH5M6QIFIMWAHIB';

// Reflector Contract for UI estimates (Testnet)
// Reflector Contract for UI estimates (Testnet)
// const REFLECTOR_ID = 'CAVLP5DH2GJPZMVO7IJY4CVOD5MWEFTJFVPD2YY2FQXOQHRGHK4D6HLP';

// Native XLM Contract on Testnet (Wrapped)
export const NATIVE_TOKEN_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
// Testnet USDC Address (CBIEL...)
export const TOKEN_ID = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';

const server = new rpc.Server('https://soroban-testnet.stellar.org:443');

export const soroban = {
    async getReflectorPrice(_tokenAddress: string): Promise<number> {
        // Suppress unused var warning
        void _tokenAddress;
        // UI Helper to estimate price.
        // In a real app, we would simulate a call to Reflector 'last_price' here.
        // For this demo, since we are using Mock Reflector logic (or assuming Testnet liquidity),
        // we'll return a static estimate to the UI, while the CONTRACT enforces the check.

        // Note: The Reflector contract 'CAVLP...' is real on Testnet.
        // We could try to reading it.
        return 5.0; // Mock Rate: 1 USD = 5 XLM
    },

    async deposit(
        buyerAddress: string,
        _amount: string,
        targetUsdValue: string,
        tokenAddress: string = NATIVE_TOKEN_ID
    ) {
        // 1. Get Account
        // Note: rpc.Server.getAccount returns an Account object compatible with TransactionBuilder
        const account = await server.getAccount(buyerAddress);

        // 2. Prepare Data
        const targetVal = Math.floor(parseFloat(targetUsdValue) * 10_000_000);

        // Convert to Stroops (Assuming _amount is the Token Amount String e.g. "5.05")
        const tokenAmountStroops = Math.floor(parseFloat(_amount) * 10_000_000);

        // 3. Build Transaction
        const contract = new Contract(CONTRACT_ID);

        const op = contract.call('deposit',
            nativeToScVal(buyerAddress, { type: 'address' }),
            nativeToScVal('GA65VXDFMPMX6WYWIV47D4T4D2UTBZ7UFTYX6SQPPUMB4LW6UITCEH22', { type: 'address' }), // Seller
            nativeToScVal(tokenAddress, { type: 'address' }),
            nativeToScVal(BigInt(tokenAmountStroops), { type: 'i128' }), // Amount
            nativeToScVal(BigInt(targetVal), { type: 'i128' })  // Target Value
        );

        let tx = new TransactionBuilder(account, { fee: '1000' })
            .addOperation(op)
            .setTimeout(TimeoutInfinite)
            .setNetworkPassphrase("Test SDF Network ; September 2015")
            .build();

        // Prepare transaction (calculate resources fees)
        tx = await server.prepareTransaction(tx);

        const xdrTx = tx.toXDR();

        // 4. Sign with Albedo
        const res = await albedo.tx({
            xdr: xdrTx,
            network: 'testnet',
            submit: false
        });

        // 5. Submit
        const result = await server.sendTransaction(TransactionBuilder.fromXDR(res.signed_envelope_xdr, "Test SDF Network ; September 2015"));

        if (result.status !== 'PENDING') {
            console.error("Tx Result", result);
            throw new Error(`Transaction failed: ${result.status}`);
        }

        // 6. Wait for transaction success and extract escrow_id
        console.log("Waiting for transaction confirmation...");
        let txResult = await server.getTransaction(result.hash);

        // Simple polling
        while (txResult.status === 'NOT_FOUND' || txResult.status === 'SUCCESS' && !txResult.resultMetaXdr) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            txResult = await server.getTransaction(result.hash);
        }

        if (txResult.status === 'FAILED') {
            throw new Error('Transaction failed after submission');
        }

        // Extract the return value (u64)
        // txResult.resultXdr contains the TransactionResult
        // In Soroban, the return value of the contract function is in the resultValue of the InvokeHostFunction result
        const resultValue = txResult.returnValue;
        let escrowId: number | undefined;
        if (resultValue) {
            escrowId = scValToNative(resultValue);
        }

        return { tx_hash: result.hash, escrow_id: escrowId };
    },

    async releaseEscrow(escrowId: number, adminAddress: string) {
        const account = await server.getAccount(adminAddress);
        const contract = new Contract(CONTRACT_ID);
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
    }
};
