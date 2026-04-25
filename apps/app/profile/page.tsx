"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { formatUnits, parseUnits, parseEther, isAddress } from "viem";
import { useWallet } from "../../hooks/useWallet";
import { usePlayerLog } from "../../hooks/usePlayerLog";
import { publicClient } from "../../lib/viem/client";
import { monadTestnet } from "../../lib/viem/chain";
import { mockIdrxContract, mockIdrxAbi, casualPoolContract, gameSessionContract } from "../../lib/viem/contracts";
import Button from "../../components/ui/Button";
import Spinner from "../../components/ui/Spinner";
import { UserIcon } from "../../components/icons";
import { parseContractError } from "../../lib/parseContractError";

// ─── Faucet cooldown ──────────────────────────────────────────────────────────

function useFaucetCooldown(address: string | undefined, type: "idrx" | "mon") {
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);
  // Ref so interval tick always reads latest value without being in effect deps
  const cooldownUntilRef = useRef(cooldownUntil);
  cooldownUntilRef.current = cooldownUntil;

  useEffect(() => {
    if (!address) return;
    fetch(`/api/faucet?address=${address}&type=${type}`)
      .then((r) => r.json())
      .then((d) => setCooldownUntil(d.cooldownUntil ?? 0))
      .catch(() => {});
  }, [address, type]);

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, cooldownUntilRef.current - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // Single stable interval — reads latest cooldownUntil via ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setClaimed = useCallback(() => {
    setCooldownUntil(Date.now() + 8 * 60 * 60 * 1000);
  }, []);

  return { onCooldown: remaining > 0, remaining, setClaimed };
}

function formatCountdown(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
}

// ─── Main component ───────────────────────────────────────────────────────────

type TokenType = "mon" | "idrx";

export default function ProfilePage() {
  const { address, walletClient, isConnected, isReady, login, logout } =
    useWallet();
  const { stats } = usePlayerLog(address);

  const [idrxBalance, setIdrxBalance] = useState<bigint>(0n);
  const [monBalance, setMonBalance] = useState<bigint>(0n);
  const [copied, setCopied] = useState(false);

  // Faucet states
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);
  const [monFaucetLoading, setMonFaucetLoading] = useState(false);
  const [monFaucetMsg, setMonFaucetMsg] = useState<string | null>(null);

  // Auto-sign
  const [autoSignActive, setAutoSignActive] = useState(false);
  const [autoSignPending, setAutoSignPending] = useState(false);
  const [autoSignError, setAutoSignError] = useState<string | null>(null);

  // Send/receive panel
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [sendToken, setSendToken] = useState<TokenType>("mon");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendPending, setSendPending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const idrxFaucet = useFaucetCooldown(address ?? undefined, "idrx");
  const monFaucet = useFaucetCooldown(address ?? undefined, "mon");

  // ── Balance fetch ─────────────────────────────────────────────────────────

  const refreshBalances = useCallback(async () => {
    if (!address) return;
    try {
      const [idrx, mon, allowanceCasual, allowanceGame] = await Promise.all([
        publicClient.readContract({
          ...mockIdrxContract,
          functionName: "balanceOf",
          args: [address],
        }),
        publicClient.getBalance({ address }),
        publicClient.readContract({
          ...mockIdrxContract,
          functionName: "allowance",
          args: [address, casualPoolContract.address],
        }),
        publicClient.readContract({
          ...mockIdrxContract,
          functionName: "allowance",
          args: [address, gameSessionContract.address],
        }),
      ]);
      setIdrxBalance(idrx);
      setMonBalance(mon);
      // Active if both spenders have allowance >= 1e18 (large enough)
      const threshold = BigInt("1000000000000000000");
      setAutoSignActive(
        (allowanceCasual as bigint) >= threshold &&
          (allowanceGame as bigint) >= threshold,
      );
    } catch {}
  }, [address]);

  useEffect(() => {
    refreshBalances();
    const id = setInterval(refreshBalances, 10_000);
    return () => clearInterval(id);
  }, [refreshBalances]);

  // ── Faucets ───────────────────────────────────────────────────────────────

  const handleIdrxFaucet = async () => {
    if (!address || idrxFaucet.onCooldown) return;
    setFaucetLoading(true);
    setFaucetMsg(null);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, type: "idrx" }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.cooldownUntil) idrxFaucet.setClaimed();
        setFaucetMsg(data.error ?? "Claim failed");
      } else {
        idrxFaucet.setClaimed();
        setFaucetMsg("+Rp 50.000 IDRX received!");
        setTimeout(refreshBalances, 3000);
      }
    } catch {
      setFaucetMsg("Faucet error. Try again.");
    } finally {
      setFaucetLoading(false);
    }
  };

  const handleMonFaucet = async () => {
    if (!address || monFaucet.onCooldown) return;
    setMonFaucetLoading(true);
    setMonFaucetMsg(null);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, type: "mon" }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.cooldownUntil) monFaucet.setClaimed();
        setMonFaucetMsg(data.error ?? "Claim failed");
      } else {
        monFaucet.setClaimed();
        setMonFaucetMsg("+1 MON received!");
        setTimeout(refreshBalances, 3000);
      }
    } catch {
      setMonFaucetMsg("Faucet error. Try again.");
    } finally {
      setMonFaucetLoading(false);
    }
  };

  // ── Send ──────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!walletClient || !address || !isAddress(sendTo) || !sendAmount) return;
    setSendPending(true);
    setSendSuccess(false);
    setSendError(null);
    try {
      let hash: `0x${string}`;
      if (sendToken === "mon") {
        hash = await walletClient.sendTransaction({
          account: address,
          chain: monadTestnet,
          to: sendTo as `0x${string}`,
          value: parseEther(sendAmount),
        });
      } else {
        hash = await walletClient.writeContract({
          account: address,
          chain: monadTestnet,
          address: mockIdrxContract.address,
          abi: mockIdrxAbi,
          functionName: "transfer",
          args: [sendTo as `0x${string}`, parseUnits(sendAmount, 2)],
        });
      }
      await publicClient.waitForTransactionReceipt({ hash });
      setSendSuccess(true);
      setTimeout(() => {
        setSendTo("");
        setSendAmount("");
        setShowSend(false);
        setSendSuccess(false);
        refreshBalances();
      }, 2000);
    } catch (e) {
      setSendError(parseContractError(e));
    } finally {
      setSendPending(false);
    }
  };

  const handleEnableAutoSign = async () => {
    if (!walletClient || !address) return;
    setAutoSignPending(true);
    setAutoSignError(null);
    const MAX = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    try {
      const hash1 = await walletClient.writeContract({
        account: address,
        chain: monadTestnet,
        address: mockIdrxContract.address,
        abi: mockIdrxAbi,
        functionName: "approve",
        args: [casualPoolContract.address, MAX],
      });
      await publicClient.waitForTransactionReceipt({ hash: hash1 });

      const hash2 = await walletClient.writeContract({
        account: address,
        chain: monadTestnet,
        address: mockIdrxContract.address,
        abi: mockIdrxAbi,
        functionName: "approve",
        args: [gameSessionContract.address, MAX],
      });
      await publicClient.waitForTransactionReceipt({ hash: hash2 });

      setAutoSignActive(true);
    } catch (e) {
      setAutoSignError(parseContractError(e));
    } finally {
      setAutoSignPending(false);
    }
  };

  const handleDisableAutoSign = async () => {
    if (!walletClient || !address) return;
    setAutoSignPending(true);
    setAutoSignError(null);
    try {
      const hash1 = await walletClient.writeContract({
        account: address,
        chain: monadTestnet,
        address: mockIdrxContract.address,
        abi: mockIdrxAbi,
        functionName: "approve",
        args: [casualPoolContract.address, 0n],
      });
      await publicClient.waitForTransactionReceipt({ hash: hash1 });

      const hash2 = await walletClient.writeContract({
        account: address,
        chain: monadTestnet,
        address: mockIdrxContract.address,
        abi: mockIdrxAbi,
        functionName: "approve",
        args: [gameSessionContract.address, 0n],
      });
      await publicClient.waitForTransactionReceipt({ hash: hash2 });

      setAutoSignActive(false);
    } catch (e) {
      setAutoSignError(parseContractError(e));
    } finally {
      setAutoSignPending(false);
    }
  };

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Render: loading ───────────────────────────────────────────────────────

  if (!isReady) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 pb-20">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 via-secondary/20 to-purple-400/20 border-2 border-primary/30 flex items-center justify-center shadow-lg">
          <UserIcon className="w-12 h-12 text-primary" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-display font-bold text-text-primary mb-1">
            Connect Wallet
          </h2>
          <p className="text-text-secondary text-sm font-sans">
            Connect wallet to view your profile and balances
          </p>
        </div>
        <Button onClick={login} size="lg" className="w-full max-w-xs">
          Connect Wallet
        </Button>
      </div>
    );
  }

  const initials = address.slice(2, 4).toUpperCase();
  const idrxFormatted = Number(formatUnits(idrxBalance, 2)).toLocaleString(
    "id-ID",
  );
  const monFormatted = Number(formatUnits(monBalance, 18)).toFixed(4);
  const winRate =
    stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-6 pb-24 bg-bg-page">
      {/* Avatar + address */}
      <div className="flex flex-col items-center mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/30 to-primary/5 border border-primary/20 flex items-center justify-center text-2xl font-bold font-display text-primary mb-3">
          {initials}
        </div>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 text-xs font-mono mt-1 transition-colors ${
            copied
              ? "text-success"
              : "text-text-secondary active:text-text-primary"
          }`}
        >
          {copied ? (
            "✓ Copied!"
          ) : (
            <>
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              {`${address.slice(0, 6)}…${address.slice(-4)} · tap to copy`}
            </>
          )}
        </button>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-bg-card rounded-2xl p-4 shadow-sm">
          <p className="text-text-secondary text-xs font-sans mb-1">
            MON Balance
          </p>
          <p className="text-text-primary font-bold font-display text-xl">
            {monFormatted}
          </p>
          <p className="text-text-secondary text-[10px] font-sans mt-0.5">
            Monad Native
          </p>
        </div>
        <div className="bg-bg-card rounded-2xl p-4 shadow-sm">
          <p className="text-text-secondary text-xs font-sans mb-1">
            IDRX Balance
          </p>
          <p className="text-text-primary font-bold font-display text-xl">
            Rp {idrxFormatted}
          </p>
          <p className="text-text-secondary text-[10px] font-sans mt-0.5">
            Indonesian Rupiah
          </p>
        </div>
      </div>

      {/* Faucet buttons */}
      <div className="flex gap-2 mb-1">
        <button
          onClick={handleMonFaucet}
          disabled={monFaucetLoading || monFaucet.onCooldown}
          className={`flex-1 py-3 rounded-2xl font-semibold text-xs font-sans transition-opacity border ${
            monFaucet.onCooldown
              ? "bg-bg-card border-black/10 text-text-secondary cursor-not-allowed"
              : "bg-purple-500/20 border-purple-500/40 text-purple-500 active:opacity-70"
          } disabled:opacity-60`}
        >
          {monFaucetLoading
            ? "Claiming..."
            : monFaucet.onCooldown
              ? formatCountdown(monFaucet.remaining)
              : "Claim MON"}
        </button>
        <button
          onClick={handleIdrxFaucet}
          disabled={faucetLoading || idrxFaucet.onCooldown}
          className={`flex-1 py-3 rounded-2xl font-semibold text-xs font-sans transition-opacity border ${
            idrxFaucet.onCooldown
              ? "bg-bg-card border-black/10 text-text-secondary cursor-not-allowed"
              : "bg-blue-500/20 border-blue-500/40 text-blue-500 active:opacity-70"
          } disabled:opacity-60`}
        >
          {faucetLoading
            ? "Claiming..."
            : idrxFaucet.onCooldown
              ? formatCountdown(idrxFaucet.remaining)
              : "Claim IDRX"}
        </button>
      </div>
      <div className="min-h-[1.25rem] mb-4 text-center">
        {(faucetMsg || monFaucetMsg) && (
          <p
            className={`text-xs font-sans ${
              (faucetMsg ?? monFaucetMsg)!.startsWith("+")
                ? "text-success"
                : "text-error"
            }`}
          >
            {faucetMsg ?? monFaucetMsg}
          </p>
        )}
      </div>

      {/* Action buttons: Send / Receive */}
      <div className="flex gap-3 mb-5">
        <button
          onClick={() => {
            setShowSend(true);
            setShowReceive(false);
            setSendError(null);
            setSendSuccess(false);
          }}
          className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-bg-card border border-black/10 active:border-primary/30 transition-colors shadow-sm"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-text-primary"
          >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
          <span className="text-text-primary text-[10px] font-medium font-sans">
            Send
          </span>
        </button>
        <button
          onClick={() => {
            setShowReceive(true);
            setShowSend(false);
          }}
          className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-bg-card border border-black/10 active:border-primary/30 transition-colors shadow-sm"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-text-primary"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
          <span className="text-text-primary text-[10px] font-medium font-sans">
            Receive
          </span>
        </button>
      </div>

      {/* Send panel */}
      {showSend && (
        <div className="bg-bg-card rounded-2xl p-4 mb-4 shadow-sm border border-black/5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-text-primary font-semibold text-sm font-sans">
              Send Token
            </p>
            <button
              onClick={() => {
                setShowSend(false);
                setSendError(null);
                setSendSuccess(false);
              }}
              className="px-3 py-1 rounded-lg bg-bg-page text-text-secondary text-xs font-sans border border-black/10"
            >
              Close
            </button>
          </div>
          {/* Token selector */}
          <div className="flex gap-2 mb-3">
            {(["mon", "idrx"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setSendToken(t)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold font-sans border transition-colors ${
                  sendToken === t
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-bg-page border-black/10 text-text-secondary"
                }`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Recipient address (0x...)"
            value={sendTo}
            onChange={(e) => setSendTo(e.target.value)}
            className="w-full bg-bg-page border border-black/10 rounded-xl px-3 py-2.5 text-text-primary text-sm font-mono mb-2 outline-none focus:border-primary/40"
          />
          <input
            type="number"
            placeholder={
              sendToken === "mon"
                ? "Amount in MON"
                : "Amount in IDRX (e.g. 1000)"
            }
            value={sendAmount}
            onChange={(e) => setSendAmount(e.target.value)}
            className="w-full bg-bg-page border border-black/10 rounded-xl px-3 py-2.5 text-text-primary text-sm font-mono mb-3 outline-none focus:border-primary/40"
          />
          <button
            onClick={handleSend}
            disabled={sendPending || !isAddress(sendTo) || !sendAmount}
            className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm font-sans disabled:opacity-40"
          >
            {sendPending
              ? "Sending..."
              : sendSuccess
                ? "✓ Sent!"
                : `Send ${sendToken.toUpperCase()}`}
          </button>
          {sendSuccess && (
            <p className="text-success text-xs mt-2 text-center font-sans">
              Transaction confirmed
            </p>
          )}
          {sendError && (
            <p className="text-error text-xs mt-2 font-sans">{sendError}</p>
          )}
        </div>
      )}

      {/* Receive panel */}
      {showReceive && (
        <div className="bg-bg-card rounded-2xl p-4 mb-4 shadow-sm border border-black/5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-text-primary font-semibold text-sm font-sans">
              Receive
            </p>
            <button
              onClick={() => setShowReceive(false)}
              className="px-3 py-1 rounded-lg bg-bg-page text-text-secondary text-xs font-sans border border-black/10"
            >
              Close
            </button>
          </div>
          <div className="bg-bg-page border border-black/10 rounded-xl p-3 mb-3">
            <p className="text-text-secondary text-[10px] font-sans mb-1">
              Your Monad address
            </p>
            <p className="text-text-primary text-xs font-mono break-all leading-relaxed">
              {address}
            </p>
          </div>
          <button
            onClick={handleCopy}
            className={`w-full py-3 rounded-xl font-semibold text-sm font-sans transition-colors ${
              copied
                ? "bg-success/10 border border-success/30 text-success"
                : "bg-primary text-white"
            }`}
          >
            {copied ? "Copied!" : "Copy Address"}
          </button>
        </div>
      )}

      {/* Separator */}
      <div className="border-t border-black/5 mb-5" />

      {/* Auto-Sign */}
      <div className="bg-bg-card rounded-2xl p-4 mb-5 shadow-sm border border-black/5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-text-primary font-semibold text-sm font-sans">
              Auto-Sign
            </p>
            <p className="text-text-secondary text-xs font-sans mt-0.5">
              Approve IDRX once — game transactions run automatically without re-confirmation.
            </p>
          </div>
          <span
            className={`w-2 h-2 rounded-full shrink-0 ml-3 ${autoSignActive ? "bg-success" : "bg-text-secondary/30"}`}
          />
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleEnableAutoSign}
            disabled={autoSignPending || autoSignActive}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold font-sans disabled:opacity-40 transition-colors ${
              autoSignActive
                ? "bg-success/15 border border-success/40 text-success"
                : "bg-primary text-white"
            }`}
          >
            {autoSignPending && !autoSignActive ? "Enabling..." : "✓ Enable"}
          </button>
          <button
            onClick={handleDisableAutoSign}
            disabled={autoSignPending || !autoSignActive}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold font-sans border border-error/30 text-error disabled:opacity-40 transition-colors"
          >
            {autoSignPending && autoSignActive ? "Disabling..." : "Disable"}
          </button>
        </div>
        {autoSignError && (
          <p className="text-error text-xs font-sans mt-2">{autoSignError}</p>
        )}
      </div>

      {/* Game stats */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        {[
          { label: "Games", value: stats.total },
          { label: "Wins", value: stats.wins },
          { label: "Win Rate", value: `${winRate}%` },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="bg-bg-card rounded-2xl p-3 text-center shadow-sm"
          >
            <p className="text-text-primary font-bold font-display text-lg">
              {value}
            </p>
            <p className="text-text-secondary text-[10px] font-sans">{label}</p>
          </div>
        ))}
      </div>

      {/* Network + Disconnect */}
      <div className="flex flex-col gap-3">
        <div className="bg-bg-card rounded-2xl shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-text-primary text-sm font-semibold font-sans">
              Network
            </p>
            <p className="text-text-secondary text-xs font-sans mt-0.5">
              Monad Testnet
            </p>
          </div>
          <span className="w-2 h-2 rounded-full bg-success" />
        </div>
        <button
          onClick={logout}
          className="w-full py-3 rounded-2xl border border-error/30 text-error text-sm font-semibold font-sans transition-all hover:bg-error/10 hover:border-error/60 active:scale-[0.98] active:opacity-70"
        >
          Disconnect Wallet
        </button>
      </div>
    </div>
  );
}
