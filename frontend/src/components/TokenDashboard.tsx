import { useEffect, useState } from "react";
import { Horizon } from "@stellar/stellar-sdk";
const { Server } = Horizon;

interface HorizonBalance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
}

interface TokenDashboardProps {
  publicKey: string;
  networkPassphrase: string;
}

export function TokenDashboard({
  publicKey,
  networkPassphrase,
}: TokenDashboardProps) {
  const [balances, setBalances] = useState<{ smoky: string; zmoke: string }>({
    smoky: "0",
    zmoke: "0",
  });

  useEffect(() => {
    async function fetchBalances() {
      // Use Testnet server
      const server = new Server("https://soroban-testnet.stellar.org");
      try {
        const account = await server.loadAccount(publicKey);

        let smoky = "0";
        let zmoke = "0";

        account.balances.forEach((b: HorizonBalance) => {
          if (
            b.asset_type === "credit_alphanum4" ||
            b.asset_type === "credit_alphanum12"
          ) {
            if (b.asset_code === "SMOKY") smoky = b.balance;
            if (b.asset_code === "ZMOKE") zmoke = b.balance;
          }
        });

        setBalances({ smoky, zmoke });
      } catch (e) {
        console.error("Failed to load balances", e);
      }
    }

    if (publicKey) void fetchBalances();
  }, [publicKey, networkPassphrase]);

  return (
    <div className="grid grid-cols-2 gap-4 mb-8">
      <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
        <h3 className="text-slate-400 text-sm font-medium mb-1">
          SMOKY Holdings
        </h3>
        <div className="text-2xl font-bold">{balances.smoky}</div>
        <div className="text-emerald-500 text-xs mt-1">Governance & Asset</div>
      </div>
      <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
        <h3 className="text-slate-400 text-sm font-medium mb-1">
          ZMOKE Rewards
        </h3>
        <div className="text-2xl font-bold">{balances.zmoke}</div>
        <div className="text-purple-500 text-xs mt-1">Loyalty Points</div>
      </div>
    </div>
  );
}
