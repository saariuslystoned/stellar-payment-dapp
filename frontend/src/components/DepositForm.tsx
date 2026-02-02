import { useState, useEffect } from 'react';
import { Horizon } from '@stellar/stellar-sdk';
import { soroban, TOKEN_ID, NATIVE_TOKEN_ID } from '../services/soroban';

const { Server } = Horizon;

interface DepositFormProps {
    buyerAddress: string;
    orderId?: string | null;
    initialAmount?: string | null;
}

export const DepositForm = ({ buyerAddress, orderId, initialAmount }: DepositFormProps) => {
    const [amount, setAmount] = useState(initialAmount || '1'); // Default 1 or prop
    const [selectedToken, setSelectedToken] = useState(TOKEN_ID); // Default USDC
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [txHash, setTxHash] = useState('');
    const [escrowId, setEscrowId] = useState<string | null>(null);
    const [zmokeBalance, setZmokeBalance] = useState<string | null>(null);
    const [hasZmokeTrustline, setHasZmokeTrustline] = useState<boolean>(false);
    const [claimStatus, setClaimStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

    // Fetch ZMOKE balance and trustline status when wallet connects
    useEffect(() => {
        if (buyerAddress) {
            const fetchZmokeInfo = async () => {
                try {
                    const server = new Server('https://horizon-testnet.stellar.org');
                    const account = await server.loadAccount(buyerAddress);
                    let zmoke = '0';
                    let hasTrust = false;
                    account.balances.forEach((b: any) => {
                        if ((b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12') && b.asset_code === 'ZMOKE') {
                            zmoke = b.balance;
                            hasTrust = true;
                        }
                    });
                    setZmokeBalance(zmoke);
                    setHasZmokeTrustline(hasTrust);
                } catch (e) {
                    console.error('Failed to fetch ZMOKE info', e);
                    setZmokeBalance('0');
                    setHasZmokeTrustline(false);
                }
            };
            fetchZmokeInfo();
        }
    }, [buyerAddress, claimStatus, status]); // Re-fetch after claim or status change

    // Claim ZMOKE rewards by creating trustline
    const handleClaimZmoke = async () => {
        try {
            setClaimStatus('loading');
            await soroban.createZmokeTrustline(buyerAddress);
            setClaimStatus('success');
            setHasZmokeTrustline(true);
            // ZMOKE distribution will be retried by backend or user can re-trigger
        } catch (e: any) {
            console.error('Failed to claim ZMOKE:', e);
            setClaimStatus('error');
        }
    };

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
                const eId = result.escrow_id.toString();
                setEscrowId(eId);

                // If this is a checkout flow (orderId present), link it in backend
                if (orderId) {
                    setMessage('Linking payment to order...');
                    try {
                        // Use env var for backend URL or default to localhost for dev
                        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';
                        await fetch(`${backendUrl}/escrow/link`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                order_id: Number(orderId),
                                escrow_id: eId,
                                buyer_address: buyerAddress,
                                tx_hash: result.tx_hash
                            })
                        });
                        console.log("Linked Order #" + orderId + " to Escrow " + eId);
                    } catch (linkErr) {
                        console.error("Failed to link escrow:", linkErr);
                        // Don't fail the UI, just log it. Backend watcher might catch it via text memo eventually if we added that, 
                        // but for now relying on this call.
                        setMessage('Deposit successful, but failed to update order status. Please contact support.');
                    }
                }
            }

        } catch (err: unknown) {
            console.error(err);
            setStatus('error');
            const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
            setMessage(errorMessage);
        }
    };

    const resetForm = () => {
        setStatus('idle');
        setMessage('');
        setTxHash('');
        setEscrowId(null);
        setAmount('1');
    };

    // Success state - show transaction complete view
    if (status === 'success') {
        return (
            <div className="w-full max-w-md p-6 bg-slate-800/50 rounded-xl border border-slate-700 backdrop-blur-sm">
                <div className="text-center space-y-6">
                    {/* Success Icon */}
                    <div className="relative mx-auto w-20 h-20">
                        <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping"></div>
                        <div className="relative w-20 h-20 bg-gradient-to-br from-emerald-500 to-green-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30">
                            <span className="text-4xl">✓</span>
                        </div>
                    </div>

                    {/* Success Message */}
                    <div>
                        <h3 className="text-2xl font-bold text-white mb-2">Transaction Complete!</h3>
                        <p className="text-slate-400">Your deposit has been successfully processed.</p>
                    </div>

                    {/* Transaction Details Card */}
                    <div className="p-4 bg-slate-900/70 rounded-lg border border-emerald-900/50 text-left space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-sm">Amount Deposited</span>
                            <span className="text-emerald-400 font-bold font-mono">${amount} USD</span>
                        </div>
                        {escrowId && (
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-sm">Escrow ID</span>
                                <span className="text-blue-400 font-bold font-mono">#{escrowId}</span>
                            </div>
                        )}
                        {txHash && (
                            <div className="pt-2 border-t border-slate-800">
                                <span className="text-slate-500 text-xs block mb-1">Transaction Hash</span>
                                <span className="text-slate-300 text-xs font-mono break-all">{txHash}</span>
                            </div>
                        )}
                    </div>

                    {/* ZMOKE Rewards Section - After TX Hash */}
                    {txHash && (
                        <div className="mt-4 p-3 bg-purple-900/30 rounded-lg border border-purple-700/50">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-purple-300 font-semibold text-sm">🪙 ZMOKE Rewards</span>
                                {hasZmokeTrustline && zmokeBalance && (
                                    <span className="text-purple-400 font-mono text-sm">{parseFloat(zmokeBalance).toFixed(2)}</span>
                                )}
                            </div>

                            {!hasZmokeTrustline && claimStatus !== 'success' && (
                                <div className="space-y-2">
                                    <p className="text-slate-400 text-xs">Add ZMOKE to your wallet to receive rewards</p>
                                    <button
                                        onClick={handleClaimZmoke}
                                        disabled={claimStatus === 'loading'}
                                        className={`w-full py-2 text-sm font-bold rounded-lg transition-all ${claimStatus === 'loading'
                                            ? 'bg-purple-800 text-purple-400 cursor-wait'
                                            : claimStatus === 'error'
                                                ? 'bg-red-600 hover:bg-red-500 text-white'
                                                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white'
                                            }`}
                                    >
                                        {claimStatus === 'loading' ? 'Adding ZMOKE...' : claimStatus === 'error' ? 'Try Again' : 'Claim ZMOKE Rewards'}
                                    </button>
                                </div>
                            )}

                            {/* If trustline just claimed, show brief confirmation */}
                            {claimStatus === 'success' && !hasZmokeTrustline && (
                                <p className="text-emerald-400 text-xs">✅ ZMOKE added to wallet!</p>
                            )}
                        </div>
                    )}

                    {/* Action Button - Only show in DApp mode, not Checkout */}
                    {!orderId && (
                        <button
                            onClick={resetForm}
                            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-emerald-500/20"
                        >
                            Make Another Transaction
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Default form state
    return (
        <div className="w-full max-w-md p-6 bg-slate-800/50 rounded-xl border border-slate-700 backdrop-blur-sm">
            <h3 className="text-xl font-bold mb-2 text-white">Make a Deposit</h3>

            {/* ZMOKE Balance - Checkout Mode Only */}
            {orderId && zmokeBalance !== null && (
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
                    <span>💨</span>
                    <span>Your ZMOKE Balance: <span className="text-purple-400 font-mono">{parseFloat(zmokeBalance).toFixed(2)}</span></span>
                </div>
            )}

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
