import { useState } from "react";
import { BlendService } from "../services/BlendService";

interface StakingPanelProps {
  publicKey: string;
  blendService: BlendService;
  signTransaction: (tx: string) => Promise<string>;
}

export function StakingPanel({
  publicKey,
  blendService,
  signTransaction,
}: StakingPanelProps) {
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string>("");

  const handleStake = () => {
    if (!amount) return;
    setStatus("Preparing transaction...");
    try {
      blendService.stakeSmoky(amount, publicKey, signTransaction);
      setStatus("✅ Staked successfully!");
    } catch (e: unknown) {
      console.error(e);
      setStatus(
        "❌ Error: " + (e instanceof Error ? e.message : "Unknown error"),
      );
    }
  };

  return (
    <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 mt-6">
      <h2 className="text-xl font-semibold mb-4">Earn ZMOKE Yield</h2>
      <div className="flex gap-4 items-end">
        <div className="flex-1">
          <label className="block text-sm text-slate-400 mb-2">
            Amount to Stake (SMOKY)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-emerald-500 outline-none"
            placeholder="0.00"
          />
        </div>
        <button
          onClick={handleStake}
          className="bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded-lg font-medium transition-colors"
        >
          Stake
        </button>
      </div>
      {status && <div className="mt-4 text-sm text-slate-300">{status}</div>}
    </div>
  );
}
