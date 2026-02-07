import { useState } from "react";

interface SecretKeyModalProps {
  publicKey: string;
  secretKey: string;
  onClose: () => void;
}

/**
 * SecretKeyModal - Displays the user's newly created wallet credentials
 *
 * This is a ONE-TIME display component. The secret key should never be stored
 * or shown again after the user confirms they've saved it.
 *
 * @param publicKey - The user's Stellar public key (G...)
 * @param secretKey - The user's Stellar secret key (S...) - SENSITIVE!
 * @param onClose - Callback when user confirms they've saved the key
 */
export const SecretKeyModal = ({
  publicKey,
  secretKey,
  onClose,
}: SecretKeyModalProps) => {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(secretKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gradient-to-b from-indigo-950 to-slate-950 rounded-2xl border border-purple-900/50 shadow-2xl shadow-purple-500/10 animate-in fade-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="p-6 text-center border-b border-purple-900/30">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-500/30">
            <span className="text-3xl">🔑</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Your Stellar Wallet</h2>
          <p className="text-slate-400 text-sm mt-2">
            Save your secret key securely.{" "}
            <span className="text-red-400 font-semibold">
              You will only see this once.
            </span>
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Public Key */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-indigo-300 mb-2">
              Public Address
            </label>
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 font-mono text-xs text-emerald-400 break-all">
              {publicKey}
            </div>
          </div>

          {/* Secret Key */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-yellow-400 mb-2">
              ⚠️ Secret Key (Save This!)
            </label>
            <div className="bg-gradient-to-br from-red-950 to-red-900 border border-red-700 rounded-lg p-3 font-mono text-xs text-red-100 break-all">
              {secretKey}
            </div>
            <button
              onClick={() => void handleCopySecret()}
              className={`w-full mt-2 py-3 rounded-lg font-bold text-sm transition-all ${
                copied
                  ? "bg-gradient-to-r from-green-600 to-emerald-600 text-white"
                  : "bg-gradient-to-r from-purple-700 to-violet-600 hover:from-purple-600 hover:to-violet-500 text-white"
              }`}
            >
              {copied ? "✅ Copied to Clipboard!" : "📋 Copy Secret Key"}
            </button>
          </div>

          {/* Warning Box */}
          <div className="bg-red-950/30 border border-dashed border-red-700/50 rounded-lg p-3">
            <p className="text-red-300 text-xs leading-relaxed">
              <strong>⚠️ IMPORTANT:</strong> This secret key controls your
              wallet and all your ZMOKE tokens. Store it in a password manager
              or other secure location.{" "}
              <strong>We cannot recover it if lost.</strong>
            </p>
          </div>

          {/* Confirmation Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="w-5 h-5 mt-0.5 accent-purple-500 rounded"
            />
            <span className="text-slate-300 text-sm leading-snug group-hover:text-white transition-colors">
              I have securely saved my secret key and understand it cannot be
              recovered.
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="p-6 pt-0">
          <button
            onClick={onClose}
            disabled={!confirmed}
            className={`w-full py-4 rounded-xl font-bold transition-all ${
              confirmed
                ? "bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white cursor-pointer shadow-lg hover:shadow-emerald-500/20"
                : "bg-slate-700 text-slate-500 cursor-not-allowed"
            }`}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
