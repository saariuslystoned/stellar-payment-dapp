import { useState } from 'react';
import { WalletConnect } from './components/WalletConnect';
import { DepositForm } from './components/DepositForm';

function App() {
  const [publicKey, setPublicKey] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center font-bold text-sm">
            🛡️
          </div>
          <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            Stellar Escrow
          </h1>
        </div>
        {publicKey ? (
          <div className="flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700 text-sm font-mono text-cyan-400">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            {publicKey.slice(0, 4)}...{publicKey.slice(-4)}
          </div>
        ) : (
          <span className="text-slate-500 text-sm">Not Connected</span>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 gap-8">
        {!publicKey ? (
          <div className="text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-500">
              Secure Payments <br /> on Stellar
            </h2>
            <p className="text-lg text-slate-400 max-w-lg mx-auto leading-relaxed">
              Volatility-protected escrow services powered by smart contracts and real-time oracles.
            </p>
            <div className="flex justify-center">
              <WalletConnect onConnect={setPublicKey} />
            </div>
          </div>
        ) : (
          <div className="w-full max-w-2xl space-y-6 animate-in zoom-in-95 duration-500">
            <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl">
              <h3 className="text-2xl font-bold mb-4">Dashboard</h3>
              <p className="text-slate-400">Welcome back, {publicKey}</p>

              <div className="mt-8 flex justify-center">
                <DepositForm buyerAddress={publicKey} />
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="p-6 border-t border-slate-800 text-center text-slate-600 text-sm">
        Powered by Soroban • Built with React & Vite
      </footer>
    </div>
  );
}

export default App;
