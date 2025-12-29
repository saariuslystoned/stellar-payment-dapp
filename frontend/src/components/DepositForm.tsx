import { useState } from 'react';
import { soroban, TOKEN_ID, NATIVE_TOKEN_ID } from '../services/soroban';

interface DepositFormProps {
    buyerAddress: string;
}

export const DepositForm = ({ buyerAddress }: DepositFormProps) => {
    const [amount, setAmount] = useState('1'); // Default 1
    const [selectedToken, setSelectedToken] = useState(TOKEN_ID); // Default USDC
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [txHash, setTxHash] = useState('');
    const [escrowId, setEscrowId] = useState<string | null>(null);

    const isUsdc = selectedToken === TOKEN_ID;
    const tokenSymbol = isUsdc ? 'USDC' : 'XLM';
    // Mock Price for UI feedback (must match Oracle logic)
    const pricePerUnit = isUsdc ? 1.0 : 5.0;

    const handleDeposit = async () => {
        try {
            setStatus('loading');

            // Calculate 1% buyer fee
            // User enters "USD Value" (e.g. 1)
            // If USDC: 1 USD = 1 USDC. Total = 1.01 USDC.
            // If XLM:  1 USD = 5 XLM.  Total = 5.05 XLM.

            const usdValue = Number(amount);
            const tokenAmount = usdValue * pricePerUnit;
            const fee = tokenAmount / 100;
            const totalTokenAmount = (tokenAmount + fee).toString();

            setMessage(`Estimating Price for ${totalTokenAmount} ${tokenSymbol}...`);

            // 1. Get Price Estimate (No longer "Signing")
            // const estimate = await soroban.getReflectorPrice(selectedToken);
            // We already used 'pricePerUnit' which is hardcoded/mocked in UI for now.

            setMessage('Sign the transaction in your wallet...');

            // 2. Submit Transaction
            // Args: buyer, tokenAmount, targetUsdValue (string), tokenAddress
            const result = await soroban.deposit(
                buyerAddress,
                totalTokenAmount,
                amount, // "1" (Target USD Value)
                selectedToken
            );
            console.log("Tx Result:", result);

            setStatus('success');
            setMessage('Deposit Successful!');
            setTxHash(result.tx_hash);
            if (result.escrow_id) {
                setEscrowId(result.escrow_id.toString());
            }

        } catch (err: unknown) {
            console.error(err);
            setStatus('error');
            const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
            setMessage(errorMessage);
        }
    };

    return (
        <div className="w-full max-w-md p-6 bg-slate-800/50 rounded-xl border border-slate-700 backdrop-blur-sm">
            <h3 className="text-xl font-bold mb-4 text-white">Make a Deposit</h3>

            <div className="space-y-4">
                {/* Token Selector */}
                <div className="flex gap-2 p-1 bg-slate-900 rounded-lg">
                    <button
                        onClick={() => setSelectedToken(TOKEN_ID)}
                        className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${isUsdc ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        🇺🇸 USDC
                    </button>
                    <button
                        onClick={() => setSelectedToken(NATIVE_TOKEN_ID)}
                        className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${!isUsdc ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        🚀 XLM
                    </button>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">
                        Deposit Value (USD)
                    </label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder="Enter USD amount"
                    />
                </div>

                <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Exchange Rate</span>
                        <span className="text-white font-mono">1 USD = {pricePerUnit.toFixed(2)} {tokenSymbol}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Token Amount</span>
                        <span className="text-white font-mono">{(Number(amount) * pricePerUnit).toFixed(2)} {tokenSymbol}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Buyer Fee (1%)</span>
                        <span className="text-white font-mono">{((Number(amount) * pricePerUnit) / 100).toFixed(2)} {tokenSymbol}</span>
                    </div>
                    <div className="border-t border-slate-800 pt-2 flex justify-between text-sm font-bold">
                        <span className="text-white">Total to Pay</span>
                        <span className="text-blue-400 font-mono">{((Number(amount) * pricePerUnit) * 1.01).toFixed(2)} {tokenSymbol}</span>
                    </div>
                </div>

                {status === 'error' && (
                    <div className="p-3 bg-red-900/20 border border-red-900 text-red-400 text-sm rounded-lg">
                        {message}
                    </div>
                )}

                {status === 'success' && (
                    <div className="p-3 bg-green-900/20 border border-green-900 text-green-400 text-sm rounded-lg break-all">
                        ✅ {message}
                        {txHash && (
                            <div className="mt-1 text-xs opacity-75">
                                Hash: {txHash}
                            </div>
                        )}
                        {escrowId && (
                            <div className="mt-1 text-sm font-bold text-blue-300">
                                Escrow ID: {escrowId}
                            </div>
                        )}
                    </div>
                )}

                <button
                    onClick={handleDeposit}
                    disabled={status === 'loading'}
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {status === 'loading' ? message : `Deposit ${tokenSymbol}`}
                </button>
            </div>
        </div>
    );
};
