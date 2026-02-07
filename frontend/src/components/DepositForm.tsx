import { useState, useEffect } from "react";
import { Horizon } from "@stellar/stellar-sdk";
import {
  soroban,
  TOKEN_ID,
  BLEND_TOKEN_ID,
  NATIVE_TOKEN_ID,
} from "../services/soroban";
import { SecretKeyModal } from "./SecretKeyModal";

const { Server } = Horizon;

interface HorizonBalance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
}

interface DepositFormProps {
  buyerAddress: string;
  orderId?: string | null;
  initialAmount?: string | null;
}

export const DepositForm = ({
  buyerAddress,
  orderId,
  initialAmount,
}: DepositFormProps) => {
  const [amount, setAmount] = useState(initialAmount || "1"); // Default 1 or prop
  const [selectedToken, setSelectedToken] = useState(TOKEN_ID); // Default USDC
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [txHash, setTxHash] = useState("");
  const [escrowId, setEscrowId] = useState<string | null>(null);
  const [zmokeBalance, setZmokeBalance] = useState<string | null>(null);
  const [hasZmokeTrustline, setHasZmokeTrustline] = useState<boolean>(false);
  const [claimStatus, setClaimStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [paidTokenAmount, setPaidTokenAmount] = useState<string>("");
  const [paidTokenSymbol, setPaidTokenSymbol] = useState<string>("");

  // Wallet enrollment state (from backend)
  const [walletInfo, setWalletInfo] = useState<{
    public_key: string;
    secret_key: string;
    message: string;
  } | null>(null);
  const [showSecretKeyModal, setShowSecretKeyModal] = useState(false);

  // Live XLM price from Reflector Oracle
  const [xlmPrice, setXlmPrice] = useState<{
    xlmPerUsd: number;
    priceUsd: number;
  } | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [priceError, setPriceError] = useState<string | null>(null);

  // Fetch ZMOKE balance and trustline status when wallet connects
  useEffect(() => {
    if (buyerAddress) {
      const fetchZmokeInfo = async () => {
        try {
          const server = new Server("https://horizon-testnet.stellar.org");
          const account = await server.loadAccount(buyerAddress);
          let zmoke = "0";
          let hasTrust = false;
          account.balances.forEach((b: HorizonBalance) => {
            if (
              (b.asset_type === "credit_alphanum4" ||
                b.asset_type === "credit_alphanum12") &&
              b.asset_code === "ZMOKE"
            ) {
              zmoke = b.balance;
              hasTrust = true;
            }
          });
          setZmokeBalance(zmoke);
          setHasZmokeTrustline(hasTrust);
        } catch (e) {
          console.error("Failed to fetch ZMOKE info", e);
          setZmokeBalance("0");
          setHasZmokeTrustline(false);
        }
      };
      void fetchZmokeInfo();
    }
  }, [buyerAddress, claimStatus, status]); // Re-fetch after claim or status change

  // Fetch live XLM price on mount and periodically
  useEffect(() => {
    const fetchPrice = async () => {
      setPriceLoading(true);
      setPriceError(null);
      try {
        const priceData = await soroban.getXlmPrice();
        setXlmPrice({
          xlmPerUsd: priceData.xlm_per_usd,
          priceUsd: priceData.price_usd,
        });
      } catch (e: unknown) {
        console.error("Failed to fetch XLM price:", e);
        setPriceError(e instanceof Error ? e.message : "Oracle unavailable");
        setXlmPrice(null);
      }
      setPriceLoading(false);
    };

    void fetchPrice();
    // Refresh price every 60 seconds
    const interval = setInterval(() => void fetchPrice(), 300000); // 5 minutes - matches Reflector oracle update frequency
    return () => clearInterval(interval);
  }, []);

  // Claim ZMOKE rewards by creating trustline
  const handleClaimZmoke = async () => {
    try {
      setClaimStatus("loading");
      await soroban.createZmokeTrustline(buyerAddress);
      setClaimStatus("success");
      setHasZmokeTrustline(true);
      // ZMOKE distribution will be retried by backend or user can re-trigger
    } catch (e: unknown) {
      console.error("Failed to claim ZMOKE:", e);
      setClaimStatus("error");
    }
  };

  const isBlend = selectedToken === BLEND_TOKEN_ID;
  const isCircle = selectedToken === TOKEN_ID;
  const isStablecoin = isBlend || isCircle;
  const tokenSymbol = isBlend ? "Blend USDC" : isCircle ? "USDC" : "XLM";
  // Use live price for XLM, 1.0 for any stablecoin - NO FALLBACK for XLM!
  const pricePerUnit = isStablecoin ? 1.0 : xlmPrice?.xlmPerUsd;
  // Block XLM deposits if price unavailable
  const xlmPriceUnavailable: boolean =
    !isStablecoin && (!xlmPrice || !!priceError);

  const handleDeposit = async () => {
    // Block if XLM price not available
    if (xlmPriceUnavailable) {
      setStatus("error");
      setMessage(
        "Cannot deposit XLM: Oracle price unavailable. Try USDC or wait for price.",
      );
      return;
    }
    if (!pricePerUnit) {
      setStatus("error");
      setMessage("Price data unavailable. Please refresh the page.");
      return;
    }

    try {
      setStatus("loading");

      // Calculate 1% buyer fee
      const usdValue = Number(amount);
      const tokenAmount = usdValue * pricePerUnit;
      const fee = tokenAmount / 100;
      const totalTokenAmount = (tokenAmount + fee).toString();

      setMessage(`Estimating Price for ${totalTokenAmount} ${tokenSymbol}...`);

      // 1. Get Price Estimate (No longer "Signing")
      // const estimate = await soroban.getReflectorPrice(selectedToken);
      // We already used 'pricePerUnit' which is hardcoded/mocked in UI for now.

      setMessage("Sign the transaction in your wallet...");

      // 2. Submit Transaction to Pool Contract
      // New signature: deposit(buyerAddress, tokenAmount, orderId, tokenAddress)
      const orderIdNum = orderId ? parseInt(orderId, 10) : Date.now(); // Use timestamp if no orderId
      const result = await soroban.deposit(
        buyerAddress,
        totalTokenAmount,
        orderIdNum,
        selectedToken,
      );
      console.log("Tx Result:", result);

      setStatus("success");
      setMessage("Deposit Successful!");
      setTxHash(result.tx_hash);
      setPaidTokenAmount(totalTokenAmount);
      setPaidTokenSymbol(tokenSymbol);

      // No escrow_id in new flow - orderId is the tracking ID
      if (orderId) {
        setMessage("Confirming payment with backend...");
        try {
          // Use env var for backend URL or default to localhost for dev
          const backendUrl =
            (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
            "http://localhost:8080";
          const confirmResponse = await fetch(`${backendUrl}/payment/confirm`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify({
              order_id: orderIdNum,
              buyer_address: buyerAddress,
              tx_hash: result.tx_hash,
              token: selectedToken,
              amount: totalTokenAmount,
            }),
          });

          const confirmData = (await confirmResponse.json()) as {
            wallet?: {
              secret_key?: string;
              public_key?: string;
              message?: string;
            };
          };
          console.log("Payment confirmed for Order #" + orderId, confirmData);
          setMessage("Payment confirmed!");

          // Check if wallet was created during enrollment
          if (confirmData.wallet?.secret_key) {
            setWalletInfo(
              confirmData.wallet as {
                public_key: string;
                secret_key: string;
                message: string;
              },
            );
            setShowSecretKeyModal(true);
          }
        } catch (confirmErr) {
          console.error("Failed to confirm payment:", confirmErr);
          // Don't fail the UI - the tx is on-chain regardless
          setMessage("Deposit successful! Order status will update shortly.");
        }
      }
    } catch (err: unknown) {
      console.error(err);
      setStatus("error");
      const errorMessage =
        err instanceof Error ? err.message : "Transaction failed";
      setMessage(errorMessage);
    }
  };

  const resetForm = () => {
    setStatus("idle");
    setMessage("");
    setTxHash("");
    setEscrowId(null);
    setAmount("1");
  };

  // Success state - show transaction complete view
  if (status === "success") {
    return (
      <>
        {/* Secret Key Modal - shown when new wallet was created */}
        {showSecretKeyModal && walletInfo && walletInfo.secret_key && (
          <SecretKeyModal
            publicKey={walletInfo.public_key}
            secretKey={walletInfo.secret_key}
            onClose={() => setShowSecretKeyModal(false)}
          />
        )}

        <div className="w-full max-w-md p-5 bg-slate-800/50 rounded-xl border border-slate-700 backdrop-blur-sm">
          <div className="text-center space-y-4">
            {/* Success Icon */}
            <div className="relative mx-auto w-16 h-16">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping"></div>
              <div className="relative w-16 h-16 bg-gradient-to-br from-emerald-500 to-green-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <span className="text-3xl">✓</span>
              </div>
            </div>

            {/* Success Message */}
            <div>
              <h3 className="text-xl font-bold text-white mb-1">
                Transaction Complete!
              </h3>
              <p className="text-slate-400 text-sm">
                Your deposit has been successfully processed.
              </p>
            </div>

            {/* Transaction Details Card */}
            <div className="p-3 bg-slate-900/70 rounded-lg border border-emerald-900/50 text-left space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-xs">Checkout Price</span>
                <span className="text-emerald-400 font-bold font-mono text-sm">
                  ${amount} USD
                </span>
              </div>
              {paidTokenSymbol === "XLM" && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs">Amount Sent</span>
                  <span className="text-cyan-400 font-bold font-mono text-sm">
                    {parseFloat(paidTokenAmount).toFixed(2)} XLM
                  </span>
                </div>
              )}
              {escrowId && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs">Escrow ID</span>
                  <span className="text-blue-400 font-bold font-mono text-sm">
                    #{escrowId}
                  </span>
                </div>
              )}
              {txHash && (
                <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-slate-500 text-xs">
                    Transaction Hash
                  </span>
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-300 text-xs font-mono hover:text-white transition-colors underline decoration-slate-600"
                  >
                    {txHash.substring(0, 8)}...
                    {txHash.substring(txHash.length - 8)}
                  </a>
                </div>
              )}
            </div>

            {/* ZMOKE Rewards Section - After TX Hash */}
            {txHash && (
              <div className="mt-2 p-2.5 bg-purple-900/30 rounded-lg border border-purple-700/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-purple-300 font-semibold text-xs">
                    🪙 ZMOKE Rewards
                  </span>
                </div>

                {/* Only show detailed breakdown when we have trustline and balance */}
                {hasZmokeTrustline && zmokeBalance !== null && (
                  <div className="space-y-1 text-xs">
                    {/* Current Balance */}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Current Balance</span>
                      <span className="text-purple-400 font-mono">
                        {parseFloat(zmokeBalance).toFixed(2)} ZMOKE
                      </span>
                    </div>

                    {/* Earned from this purchase */}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">
                        Earned (${Number(amount).toFixed(2)} × 10)
                      </span>
                      <span className="text-emerald-400 font-mono">
                        +{(Number(amount) * 10).toFixed(2)} ZMOKE
                      </span>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-purple-700/50 my-1"></div>

                    {/* New Total */}
                    <div className="flex justify-between items-center">
                      <span className="text-purple-200 font-medium">
                        After Distribution
                      </span>
                      <span className="text-purple-300 font-mono font-bold">
                        {(
                          parseFloat(zmokeBalance) +
                          Number(amount) * 10
                        ).toFixed(2)}{" "}
                        ZMOKE
                      </span>
                    </div>

                    <p className="text-slate-500 text-[10px] mt-1">
                      ⏳ ZMOKE distributed after escrow clears
                    </p>
                  </div>
                )}

                {!hasZmokeTrustline && claimStatus !== "success" && (
                  <div className="space-y-2">
                    <p className="text-slate-400 text-xs">
                      Add ZMOKE to your wallet to receive rewards
                    </p>
                    <button
                      onClick={() => void handleClaimZmoke()}
                      disabled={claimStatus === "loading"}
                      className={`w-full py-1.5 text-xs font-bold rounded-lg transition-all ${
                        claimStatus === "loading"
                          ? "bg-purple-800 text-purple-400 cursor-wait"
                          : claimStatus === "error"
                            ? "bg-red-600 hover:bg-red-500 text-white"
                            : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white"
                      }`}
                    >
                      {claimStatus === "loading"
                        ? "Adding ZMOKE..."
                        : claimStatus === "error"
                          ? "Try Again"
                          : "Claim ZMOKE Rewards"}
                    </button>
                  </div>
                )}

                {/* If trustline just claimed, show brief confirmation */}
                {claimStatus === "success" && !hasZmokeTrustline && (
                  <p className="text-emerald-400 text-xs">
                    ✅ ZMOKE added to wallet!
                  </p>
                )}
              </div>
            )}

            {/* Action Button - Only show in DApp mode, not Checkout */}
            {!orderId && (
              <button onClick={resetForm}>Make Another Transaction</button>
            )}
          </div>
        </div>
      </>
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
          <span>
            Your ZMOKE Balance:{" "}
            <span className="text-purple-400 font-mono">
              {parseFloat(zmokeBalance).toFixed(2)}
            </span>
          </span>
        </div>
      )}

      <div className="space-y-4">
        {/* Token Selector */}
        <div className="flex gap-2 p-1 bg-slate-900 rounded-lg">
          <button
            onClick={() => setSelectedToken(BLEND_TOKEN_ID)}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
              isBlend
                ? "bg-slate-700 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            💵 Blend USDC
          </button>
          <button
            onClick={() => setSelectedToken(TOKEN_ID)}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
              isCircle
                ? "bg-slate-700 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            🇺🇸 USDC
          </button>
          <button
            onClick={() => setSelectedToken(NATIVE_TOKEN_ID)}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
              !isStablecoin
                ? "bg-slate-700 text-white shadow"
                : "text-slate-400 hover:text-white"
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
            <span className="text-slate-400 flex items-center gap-2">
              Exchange Rate
              {!isStablecoin &&
                (priceLoading ? (
                  <span className="text-xs text-yellow-500 animate-pulse">
                    ⏳
                  </span>
                ) : priceError ? (
                  <span className="text-xs text-red-500" title={priceError}>
                    ⚠️ ERROR
                  </span>
                ) : (
                  <span
                    className="text-xs text-emerald-500"
                    title="Live price from Reflector Oracle"
                  >
                    🔴 LIVE
                  </span>
                ))}
            </span>
            <span className="text-white font-mono">
              {xlmPriceUnavailable ? (
                <span className="text-red-400">Price unavailable</span>
              ) : (
                <>
                  1 USD = {(pricePerUnit ?? 0).toFixed(2)} {tokenSymbol}
                  {!isStablecoin && xlmPrice && (
                    <span className="text-slate-500 text-xs ml-1">
                      (${xlmPrice.priceUsd.toFixed(4)})
                    </span>
                  )}
                </>
              )}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Token Amount</span>
            <span className="text-white font-mono">
              {xlmPriceUnavailable
                ? "--"
                : (Number(amount) * (pricePerUnit ?? 0)).toFixed(2)}{" "}
              {tokenSymbol}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Buyer Fee (1%)</span>
            <span className="text-white font-mono">
              {xlmPriceUnavailable
                ? "--"
                : ((Number(amount) * (pricePerUnit ?? 0)) / 100).toFixed(
                    2,
                  )}{" "}
              {tokenSymbol}
            </span>
          </div>
          <div className="border-t border-slate-800 pt-2 flex justify-between text-sm font-bold">
            <span className="text-white">Total to Pay</span>
            <span className="text-blue-400 font-mono">
              {xlmPriceUnavailable
                ? "--"
                : (Number(amount) * (pricePerUnit ?? 0) * 1.01).toFixed(2)}{" "}
              {tokenSymbol}
            </span>
          </div>
        </div>

        {status === "error" && (
          <div className="p-3 bg-red-900/20 border border-red-900 text-red-400 text-sm rounded-lg">
            {message}
          </div>
        )}

        <button
          onClick={() => void handleDeposit()}
          disabled={status === "loading" || xlmPriceUnavailable}
          className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "loading"
            ? message
            : xlmPriceUnavailable
              ? "Oracle Unavailable - Use USDC"
              : `Deposit ${tokenSymbol}`}
        </button>
      </div>
    </div>
  );
};
