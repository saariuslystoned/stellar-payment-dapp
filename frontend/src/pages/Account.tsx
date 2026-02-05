import { useState, useEffect } from 'react';
import { Horizon } from '@stellar/stellar-sdk';
import { soroban } from '../services/soroban';

const { Server } = Horizon;

interface AccountProps {
    publicKey: string;
}

interface WalletBalance {
    asset: string;
    balance: string;
    issuer?: string;
}

/**
 * Account Page Component
 * 
 * Displays user account information with multiple tabs:
 * - Overview: Basic account stats
 * - Wallet: ZMOKE balance, redemption functionality
 * - History: Transaction history (future)
 */
export const Account = ({ publicKey }: AccountProps) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'wallet' | 'history'>('wallet');
    const [balances, setBalances] = useState<WalletBalance[]>([]);
    const [zmokeBalance, setZmokeBalance] = useState<string>('0');
    const [loading, setLoading] = useState(true);
    const [redeemAmount, setRedeemAmount] = useState<string>('');
    const [redeemStatus, setRedeemStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [redeemMessage, setRedeemMessage] = useState('');

    // ZMOKE to USD conversion rate (10 ZMOKE = $1)
    const ZMOKE_TO_USD_RATE = 0.10;

    // Treasury address for ZMOKE burns
    const TREASURY_ADDRESS = import.meta.env.VITE_TREASURY_ADDRESS || 'GCEXAMPLE...';

    useEffect(() => {
        const fetchBalances = async () => {
            try {
                setLoading(true);
                const server = new Server('https://horizon-testnet.stellar.org');
                const account = await server.loadAccount(publicKey);

                const parsedBalances: WalletBalance[] = [];
                let zmoke = '0';

                account.balances.forEach((b: any) => {
                    if (b.asset_type === 'native') {
                        parsedBalances.push({ asset: 'XLM', balance: b.balance });
                    } else if (b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12') {
                        parsedBalances.push({
                            asset: b.asset_code,
                            balance: b.balance,
                            issuer: b.asset_issuer
                        });
                        if (b.asset_code === 'ZMOKE') {
                            zmoke = b.balance;
                        }
                    }
                });

                setBalances(parsedBalances);
                setZmokeBalance(zmoke);
            } catch (e) {
                console.error('Failed to fetch account:', e);
            } finally {
                setLoading(false);
            }
        };

        if (publicKey) {
            fetchBalances();
        }
    }, [publicKey, redeemStatus]);

    const handleRedeem = async () => {
        const amount = parseFloat(redeemAmount);
        if (isNaN(amount) || amount <= 0) {
            setRedeemStatus('error');
            setRedeemMessage('Please enter a valid amount');
            return;
        }

        if (amount > parseFloat(zmokeBalance)) {
            setRedeemStatus('error');
            setRedeemMessage('Insufficient ZMOKE balance');
            return;
        }

        try {
            setRedeemStatus('loading');
            setRedeemMessage('Preparing redemption transaction...');

            // Build and sign the ZMOKE transfer (burn) to Treasury
            const txHash = await soroban.burnZmokeForCredit(publicKey, amount.toString(), TREASURY_ADDRESS);

            setRedeemMessage('Confirming with backend...');

            // Notify backend to credit the user's WooCommerce account
            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';
            const response = await fetch(`${backendUrl}/api/convert-zmoke`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true'
                },
                body: JSON.stringify({
                    tx_hash: txHash,
                    amount: amount,
                    buyer_address: publicKey
                })
            });

            if (!response.ok) {
                throw new Error('Failed to confirm redemption with backend');
            }

            await response.json();

            setRedeemStatus('success');
            setRedeemMessage(`Successfully redeemed ${amount} ZMOKE for $${(amount * ZMOKE_TO_USD_RATE).toFixed(2)} store credit!`);
            setRedeemAmount('');

        } catch (e: any) {
            console.error('Redemption failed:', e);
            setRedeemStatus('error');
            setRedeemMessage(e.message || 'Redemption failed. Please try again.');
        }
    };

    const usdValue = parseFloat(redeemAmount || '0') * ZMOKE_TO_USD_RATE;

    const tabs = [
        { id: 'overview', label: 'Overview', icon: '📊' },
        { id: 'wallet', label: 'Wallet', icon: '🪙' },
        { id: 'history', label: 'History', icon: '📜' },
    ] as const;

    return (
        <div className="w-full max-w-2xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                    <span className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                        👤
                    </span>
                    My Account
                </h1>
                <p className="text-slate-400 text-sm mt-1 ml-13">
                    Manage your wallet and ZMOKE rewards
                </p>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 p-1 bg-slate-900 rounded-xl mb-6">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-3 px-4 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${activeTab === tab.id
                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                            }`}
                    >
                        <span>{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className="p-6 space-y-4">
                        <h2 className="text-lg font-semibold text-white mb-4">Account Overview</h2>

                        {/* Address Card */}
                        <div className="p-4 bg-slate-800/50 rounded-xl">
                            <label className="text-xs text-slate-500 uppercase tracking-wider">Stellar Address</label>
                            <p className="font-mono text-sm text-emerald-400 mt-1 break-all">{publicKey}</p>
                        </div>

                        {/* Balances Grid */}
                        {loading ? (
                            <div className="text-center py-8 text-slate-500">Loading balances...</div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {balances.map((b, i) => (
                                    <div key={i} className="p-4 bg-slate-800/50 rounded-xl">
                                        <span className="text-xs text-slate-500 uppercase">{b.asset}</span>
                                        <p className="text-xl font-bold text-white mt-1">
                                            {parseFloat(b.balance).toFixed(2)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Wallet Tab (ZMOKE Focus) */}
                {activeTab === 'wallet' && (
                    <div className="p-6 space-y-6">
                        {/* ZMOKE Balance Card */}
                        <div className="bg-gradient-to-br from-purple-900/50 to-pink-900/30 rounded-xl p-6 border border-purple-700/50">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-purple-300 text-sm font-medium">ZMOKE Balance</span>
                                <span className="text-xs text-purple-400 bg-purple-900/50 px-2 py-1 rounded-full">
                                    ≈ ${(parseFloat(zmokeBalance) * ZMOKE_TO_USD_RATE).toFixed(2)} USD
                                </span>
                            </div>
                            <p className="text-4xl font-bold text-white">
                                {loading ? '...' : parseFloat(zmokeBalance).toFixed(2)}
                                <span className="text-lg text-purple-300 ml-2">ZMOKE</span>
                            </p>
                            <p className="text-xs text-slate-500 mt-2">
                                Earn 10 ZMOKE for every $1 spent at checkout
                            </p>
                        </div>

                        {/* Redeem Section */}
                        <div className="bg-slate-800/50 rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                💰 Redeem for Store Credit
                            </h3>
                            <p className="text-sm text-slate-400 mb-4">
                                Convert your ZMOKE tokens to store credit at a rate of <strong className="text-emerald-400">10 ZMOKE = $1.00</strong>
                            </p>

                            {/* Redeem Input */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">
                                        Amount to Redeem
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={redeemAmount}
                                            onChange={(e) => setRedeemAmount(e.target.value)}
                                            placeholder="Enter ZMOKE amount"
                                            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all pr-20"
                                            disabled={redeemStatus === 'loading'}
                                        />
                                        <button
                                            onClick={() => setRedeemAmount(zmokeBalance)}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded transition-colors"
                                        >
                                            MAX
                                        </button>
                                    </div>
                                </div>

                                {/* Conversion Preview */}
                                {redeemAmount && parseFloat(redeemAmount) > 0 && (
                                    <div className="p-3 bg-emerald-900/30 border border-emerald-700/50 rounded-lg">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-emerald-300">You will receive:</span>
                                            <span className="text-emerald-400 font-bold text-lg">${usdValue.toFixed(2)} USD</span>
                                        </div>
                                    </div>
                                )}

                                {/* Status Messages */}
                                {redeemStatus === 'error' && (
                                    <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-400 text-sm">
                                        {redeemMessage}
                                    </div>
                                )}
                                {redeemStatus === 'success' && (
                                    <div className="p-3 bg-emerald-900/30 border border-emerald-700/50 rounded-lg text-emerald-400 text-sm">
                                        ✅ {redeemMessage}
                                    </div>
                                )}

                                {/* Redeem Button */}
                                <button
                                    onClick={handleRedeem}
                                    disabled={redeemStatus === 'loading' || !redeemAmount || parseFloat(redeemAmount) <= 0}
                                    className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {redeemStatus === 'loading' ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <span className="animate-spin">⏳</span>
                                            {redeemMessage}
                                        </span>
                                    ) : (
                                        'Redeem ZMOKE'
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Info Card */}
                        <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 text-sm text-slate-400">
                            <p className="mb-2"><strong className="text-white">How it works:</strong></p>
                            <ol className="list-decimal list-inside space-y-1 text-xs">
                                <li>Enter the amount of ZMOKE you want to redeem</li>
                                <li>Sign the transaction in your wallet</li>
                                <li>Your ZMOKE is burned and store credit is added to your account</li>
                                <li>Credit is automatically applied at your next checkout</li>
                            </ol>
                        </div>
                    </div>
                )}

                {/* History Tab (Placeholder) */}
                {activeTab === 'history' && (
                    <div className="p-6 text-center py-12">
                        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">📜</span>
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-2">Transaction History</h3>
                        <p className="text-slate-500 text-sm">
                            Coming soon! View your ZMOKE earnings and redemptions.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
