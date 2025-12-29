import { useState } from 'react';
import albedo from '@albedo-link/intent';

interface WalletConnectProps {
    onConnect: (publicKey: string) => void;
}

export const WalletConnect = ({ onConnect }: WalletConnectProps) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const connectWallet = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await albedo.publicKey({
                token: 'stellar-payment-dapp-login' // Optional, for signature verification
            });
            onConnect(result.pubkey);
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center gap-4 p-6 bg-slate-900 rounded-xl border border-slate-700 shadow-2xl">
            <h2 className="text-xl font-bold text-white">Connect Your Wallet</h2>
            <p className="text-slate-400 text-center max-w-xs">
                Connect your Stellar wallet to securely deposit funds into the escrow.
            </p>

            {error && (
                <div className="text-red-400 text-sm bg-red-950/30 p-2 rounded border border-red-900">
                    {error}
                </div>
            )}

            <button
                onClick={connectWallet}
                disabled={loading}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
                {loading ? (
                    <span className="animate-spin">⏳</span>
                ) : (
                    <span>🔗</span>
                )}
                {loading ? 'Connecting...' : 'Connect with Albedo'}
            </button>
        </div>
    );
};
