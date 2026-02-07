// Build: 1770147200
import { useState, useMemo } from "react";
import { WalletConnect } from "./components/WalletConnect";
import { DepositForm } from "./components/DepositForm";
import { TokenDashboard } from "./components/TokenDashboard";
import { StakingPanel } from "./components/StakingPanel";
import { BlendService } from "./services/BlendService";

function App() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [networkPassphrase] = useState("Test SDF Network ; September 2015");

  const blendService = useMemo(
    () => new BlendService(networkPassphrase),
    [networkPassphrase],
  );

  // Check for URL params for checkout mode
  const queryParams = new URLSearchParams(window.location.search);
  const orderId = queryParams.get("order_id");
  const initialAmount = queryParams.get("amount");
  const isCheckoutMode = !!orderId;

  // Mock signer for now (In real app, pass kit.signTransaction)
  const signTx = (tx: string): Promise<string> => {
    console.log("Signing", tx);
    return Promise.resolve(tx);
  };

  // Checkout Mode UI - Minimal, no-scroll version
  if (isCheckoutMode) {
    return (
      <div
        className="bg-slate-950 text-white flex flex-col justify-center items-center h-screen w-screen overflow-hidden"
        style={{ margin: 0, padding: 0 }}
      >
        {publicKey ? (
          <div className="w-full max-w-sm bg-slate-900/90 p-6 rounded-xl border border-slate-700 shadow-xl">
            <div className="mb-4 text-center">
              <span className="text-slate-500 text-xs uppercase tracking-widest">
                Order #{orderId}
              </span>
              <h2 className="text-xl font-bold mt-1 text-emerald-400">
                Pay with Stellar
              </h2>
            </div>
            <DepositForm
              buyerAddress={publicKey}
              orderId={orderId}
              initialAmount={initialAmount}
            />
            <p className="mt-4 text-center text-xs text-slate-600">
              Powered by Soroban Escrow
            </p>
          </div>
        ) : (
          <div className="w-full max-w-sm p-4">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-white mb-1">
                Complete Your Order
              </h2>
              <p className="text-slate-400 text-sm">Order #{orderId}</p>
            </div>
            <WalletConnect
              publicKey={publicKey}
              onConnect={setPublicKey}
              onDisconnect={() => setPublicKey(null)}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-emerald-500 to-cyan-500 rounded-lg flex items-center justify-center font-bold text-xl shadow-lg shadow-emerald-500/20">
            S
          </div>
          <h1 className="text-2xl font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            SMOKY
          </h1>
        </div>
        <WalletConnect
          publicKey={publicKey}
          onConnect={setPublicKey}
          onDisconnect={() => setPublicKey(null)}
        />
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-12 max-w-7xl mx-auto w-full">
        <div className="max-w-3xl mx-auto">
          {publicKey ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <TokenDashboard
                publicKey={publicKey}
                networkPassphrase={networkPassphrase}
              />

              <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-xl">
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                  <div className="w-2 h-8 bg-emerald-500 rounded-full"></div>
                  Payment Escrow
                </h2>
                <DepositForm buyerAddress={publicKey} />
              </div>

              <StakingPanel
                publicKey={publicKey}
                blendService={blendService}
                signTransaction={signTx}
              />
            </div>
          ) : (
            <div className="text-center py-20 animate-in fade-in zoom-in-95 duration-700">
              <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-800">
                <span className="text-4xl">🔐</span>
              </div>
              <h2 className="text-3xl font-bold mb-4">
                Welcome to Smoky Coins
              </h2>
              <p className="text-slate-400 max-w-md mx-auto mb-8">
                Connect your freighter wallet to access your SMOKY tokens, earn
                ZMOKE rewards, and manage secure escrow payments.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 border-t border-slate-800 text-center text-slate-500 text-sm">
        <p>© 2026 Smoky Coins dApp. Built on Stellar.</p>
      </footer>
    </div>
  );
}

export default App;
