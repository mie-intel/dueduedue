"use client";

import { useSendTransaction } from "@privy-io/react-auth";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData } from "viem";
import { LogIcon } from "../../components/icons";
import Button from "../../components/ui/Button";
import Spinner from "../../components/ui/Spinner";
import { useCreatorStats } from "../../hooks/useCreatorStats";
import type { GameMode } from "../../hooks/usePlayerLog";
import { usePlayerLog } from "../../hooks/usePlayerLog";
import { usePvpPayout } from "../../hooks/usePvpPayout";
import { useWallet } from "../../hooks/useWallet";
import { parseContractError } from "../../lib/parseContractError";
import { monadTestnet } from "../../lib/viem/chain";
import { publicClient } from "../../lib/viem/client";
import {
  casualPoolAbi,
  casualPoolContract,
  gameSessionAbi,
  gameSessionContract,
  mockIdrxContract,
} from "../../lib/viem/contracts";

const MODE_LABELS: Record<GameMode, string> = {
  free: "Free",
  casual: "Casual",
  competitive: "Competitive",
};

const MODE_COLORS: Record<GameMode, string> = {
  free: "text-primary bg-primary-light border-primary/30",
  casual: "text-secondary-dark bg-secondary-light border-secondary/30",
  competitive: "text-error bg-red-50 border-error/30",
};

function formatAmount(amount: number, mode: GameMode): string {
  if (mode === "free" || amount === 0) return "—";
  const idrx = Math.abs(amount).toLocaleString("id-ID");
  return amount > 0 ? `+Rp ${idrx}` : `-Rp ${idrx}`;
}

function formatSignedIdrx(amount: number): string {
  const idrx = Math.abs(amount).toLocaleString("id-ID");
  if (amount > 0) return `+Rp ${idrx}`;
  if (amount < 0) return `-Rp ${idrx}`;
  return "Rp 0";
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) +
    " · " +
    d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
  );
}

function formatIdrx(raw: number): string {
  // raw IDRX has 2 decimals
  return (raw / 100).toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

type FilterMode = "all" | GameMode;
type Tab = "game" | "creator";

export default function PlayerLogPage() {
  const router = useRouter();
  const { sendTransaction } = useSendTransaction();
  const {
    isReady,
    isConnected,
    address,
    walletClient,
    walletClientType,
    connectorType,
    login,
  } = useWallet();
  const { entries, stats } = usePlayerLog(address);
  const {
    questions,
    pendingRoyalty,
    loading: creatorLoading,
    error: creatorError,
    refresh: refreshCreatorStats,
    clearPendingRoyalty,
  } = useCreatorStats(address);
  const {
    pendingPvpPayout,
    error: pvpPayoutError,
    refresh: refreshPvpPayout,
    clearPendingPvpPayout,
  } = usePvpPayout(address);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [tab, setTab] = useState<Tab>("game");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawSuccess, setWithdrawSuccess] = useState("");
  const [pvpWithdrawing, setPvpWithdrawing] = useState(false);
  const [pvpWithdrawError, setPvpWithdrawError] = useState("");
  const [pvpWithdrawSuccess, setPvpWithdrawSuccess] = useState("");

  useEffect(() => {
    if (entries.length > 0 && entries[0].result === "win") {
      refreshPvpPayout();
    }
  }, [entries, refreshPvpPayout]);

  const handleWithdraw = useCallback(async () => {
    if (!address || pendingRoyalty === 0) return;
    setWithdrawing(true);
    setWithdrawError("");
    setWithdrawSuccess("");
    try {
      const balanceBefore = (await publicClient.readContract({
        ...mockIdrxContract,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      const poolBalance = (await publicClient.readContract({
        ...mockIdrxContract,
        functionName: "balanceOf",
        args: [casualPoolContract.address],
      })) as bigint;

      if (poolBalance < BigInt(pendingRoyalty)) {
        throw new Error(
          "Escrow is recorded, but the pool contract does not have enough IDRX to pay it out.",
        );
      }

      await publicClient.simulateContract({
        address: casualPoolContract.address,
        abi: casualPoolAbi,
        functionName: "withdrawRoyalty",
        args: [],
        account: address as `0x${string}`,
        chain: monadTestnet,
      });
      const estimatedGas = await publicClient.estimateContractGas({
        address: casualPoolContract.address,
        abi: casualPoolAbi,
        functionName: "withdrawRoyalty",
        args: [],
        account: address as `0x${string}`,
      });
      const gasLimit = estimatedGas + estimatedGas / 10n;
      const isEmbeddedPrivyWallet =
        walletClientType === "privy" || connectorType === "embedded";
      const externalWalletClient = walletClient;

      let hash: `0x${string}`;
      if (isEmbeddedPrivyWallet) {
        hash = (
          await sendTransaction(
            {
              from: address,
              to: casualPoolContract.address,
              data: encodeFunctionData({
                abi: casualPoolAbi,
                functionName: "withdrawRoyalty",
                args: [],
              }),
              chainId: monadTestnet.id,
              gasLimit: gasLimit,
            },
            {
              address,
              uiOptions: {
                showWalletUIs: true,
                description: "Withdraw escrow to your embedded wallet",
                buttonText: "Withdraw",
                successHeader: "Withdraw complete",
              },
            },
          )
        ).hash as `0x${string}`;
      } else {
        if (!externalWalletClient) {
          throw new Error("Wallet signer is not ready yet.");
        }
        hash = await externalWalletClient.writeContract({
          address: casualPoolContract.address,
          abi: casualPoolAbi,
          functionName: "withdrawRoyalty",
          args: [],
          account: address as `0x${string}`,
          chain: monadTestnet,
          gas: gasLimit,
        });
      }
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        throw new Error(
          "Withdraw transaction reverted on-chain. This usually means gas or contract state changed before confirmation.",
        );
      }

      clearPendingRoyalty();
      const balanceAfter = (await publicClient.readContract({
        ...mockIdrxContract,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      const received = Number(balanceAfter - balanceBefore);
      const displayAmount = received > 0 ? received : pendingRoyalty;
      setWithdrawSuccess(
        `Escrow withdrawn. Rp ${formatIdrx(displayAmount)} sent to your wallet.`,
      );
      refreshCreatorStats();
    } catch (e) {
      setWithdrawError(parseContractError(e));
      refreshCreatorStats();
    } finally {
      setWithdrawing(false);
    }
  }, [
    address,
    connectorType,
    sendTransaction,
    walletClient,
    walletClientType,
    pendingRoyalty,
    clearPendingRoyalty,
    refreshCreatorStats,
  ]);

  const handlePvpWithdraw = useCallback(async () => {
    if (!address || pendingPvpPayout === 0) return;
    setPvpWithdrawing(true);
    setPvpWithdrawError("");
    setPvpWithdrawSuccess("");
    try {
      const balanceBefore = (await publicClient.readContract({
        ...mockIdrxContract,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      const gameBalance = (await publicClient.readContract({
        ...mockIdrxContract,
        functionName: "balanceOf",
        args: [gameSessionContract.address],
      })) as bigint;

      if (gameBalance < BigInt(pendingPvpPayout)) {
        throw new Error(
          "PvP payout is recorded, but the game contract does not have enough IDRX to pay it out.",
        );
      }

      await publicClient.simulateContract({
        address: gameSessionContract.address,
        abi: gameSessionAbi,
        functionName: "withdrawPvpPayout",
        args: [],
        account: address as `0x${string}`,
        chain: monadTestnet,
      });
      const estimatedGas = await publicClient.estimateContractGas({
        address: gameSessionContract.address,
        abi: gameSessionAbi,
        functionName: "withdrawPvpPayout",
        args: [],
        account: address as `0x${string}`,
      });
      const gasLimit = estimatedGas + estimatedGas / 10n;
      const isEmbeddedPrivyWallet =
        walletClientType === "privy" || connectorType === "embedded";
      const externalWalletClient = walletClient;

      let hash: `0x${string}`;
      if (isEmbeddedPrivyWallet) {
        hash = (
          await sendTransaction(
            {
              from: address,
              to: gameSessionContract.address,
              data: encodeFunctionData({
                abi: gameSessionAbi,
                functionName: "withdrawPvpPayout",
                args: [],
              }),
              chainId: monadTestnet.id,
              gasLimit,
            },
            {
              address,
              uiOptions: {
                showWalletUIs: true,
                description: "Withdraw PvP payout to your embedded wallet",
                buttonText: "Withdraw",
                successHeader: "Withdraw complete",
              },
            },
          )
        ).hash as `0x${string}`;
      } else {
        if (!externalWalletClient) {
          throw new Error("Wallet signer is not ready yet.");
        }
        hash = await externalWalletClient.writeContract({
          address: gameSessionContract.address,
          abi: gameSessionAbi,
          functionName: "withdrawPvpPayout",
          args: [],
          account: address as `0x${string}`,
          chain: monadTestnet,
          gas: gasLimit,
        });
      }
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        throw new Error(
          "Withdraw transaction reverted on-chain. This usually means gas or contract state changed before confirmation.",
        );
      }

      clearPendingPvpPayout();
      const balanceAfter = (await publicClient.readContract({
        ...mockIdrxContract,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      const received = Number(balanceAfter - balanceBefore);
      const displayAmount = received > 0 ? received : pendingPvpPayout;
      setPvpWithdrawSuccess(
        `PvP payout withdrawn. Rp ${formatIdrx(displayAmount)} sent to your wallet.`,
      );
      refreshPvpPayout();
    } catch (e) {
      setPvpWithdrawError(parseContractError(e));
      refreshPvpPayout();
    } finally {
      setPvpWithdrawing(false);
    }
  }, [
    address,
    connectorType,
    sendTransaction,
    walletClient,
    walletClientType,
    pendingPvpPayout,
    clearPendingPvpPayout,
    refreshPvpPayout,
  ]);

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
          <LogIcon className="w-12 h-12 text-primary" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-display font-bold text-text-primary mb-1">
            Connect Wallet
          </h2>
          <p className="text-text-secondary text-sm font-sans">
            Connect wallet to view your game history and stats
          </p>
        </div>
        <Button onClick={login} size="lg" className="w-full max-w-xs">
          Connect Wallet
        </Button>
      </div>
    );
  }

  const filtered =
    filter === "all" ? entries : entries.filter((e) => e.mode === filter);
  const winRate =
    stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-6 pb-24">
      <h1 className="text-xl font-bold font-display text-text-primary mb-4">
        Activity
      </h1>

      {/* Top-level tabs */}
      <div className="flex gap-1 bg-bg-card rounded-2xl p-1 mb-5 shadow-sm">
        {(["game", "creator"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold font-sans transition-colors ${
              tab === t
                ? "bg-primary text-white shadow-sm"
                : "text-text-secondary"
            }`}
          >
            {t === "game" ? "Game Log" : "Creator"}
          </button>
        ))}
      </div>

      {/* ── GAME LOG TAB ── */}
      {tab === "game" && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2 mb-5">
            {[
              { label: "Games", value: stats.total },
              { label: "Wins", value: stats.wins },
              { label: "Losses", value: stats.losses },
              { label: "Win Rate", value: `${winRate}%` },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="bg-bg-card rounded-2xl p-3 text-center shadow-sm"
              >
                <p className="text-text-primary font-bold text-base font-display">
                  {value}
                </p>
                <p className="text-text-secondary text-[10px] font-sans mt-0.5">
                  {label}
                </p>
              </div>
            ))}
          </div>

          {/* Earnings summary */}
          <div className="bg-bg-card rounded-2xl p-4 mb-5 shadow-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-text-secondary text-xs font-sans">
                  Profit / Loss
                </p>
                <p
                  className={`font-bold font-display text-lg mt-1 ${
                    stats.netProfitLoss > 0
                      ? "text-success"
                      : stats.netProfitLoss < 0
                        ? "text-error"
                        : "text-text-secondary"
                  }`}
                >
                  {formatSignedIdrx(stats.netProfitLoss)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-text-secondary text-xs font-sans">
                  Total Withdrawable
                </p>
                <p
                  className={`font-bold font-display text-lg mt-1 ${
                    pendingPvpPayout > 0 ? "text-success" : "text-text-secondary"
                  }`}
                >
                  Rp {formatIdrx(pendingPvpPayout)}
                </p>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <Button
                onClick={handlePvpWithdraw}
                loading={pvpWithdrawing}
                disabled={pendingPvpPayout === 0 || pvpWithdrawing}
                size="sm"
              >
                Withdraw
              </Button>
            </div>
            {(pvpWithdrawError || pvpPayoutError) && (
              <p className="text-error text-xs font-sans mt-2 text-right">
                {pvpWithdrawError || pvpPayoutError}
              </p>
            )}
            {pvpWithdrawSuccess && (
              <p className="text-success text-xs font-sans mt-2 text-right">
                {pvpWithdrawSuccess}
              </p>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-none">
            {(["all", "free", "casual", "competitive"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setFilter(m)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold font-sans border transition-colors ${
                  filter === m
                    ? "bg-primary text-white border-primary"
                    : "bg-bg-card text-text-secondary border-black/10"
                }`}
              >
                {m === "all" ? "All" : MODE_LABELS[m]}
              </button>
            ))}
          </div>

          {/* Log entries */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-text-secondary/40"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
                <line x1="9" y1="12" x2="15" y2="12" />
                <line x1="9" y1="16" x2="13" y2="16" />
              </svg>
              <p className="text-text-secondary text-sm font-sans">
                No games yet. Start playing!
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-bg-card rounded-2xl p-4 flex items-center justify-between shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        entry.result === "win"
                          ? "bg-success/20 text-success"
                          : entry.result === "lose"
                            ? "bg-error/20 text-error"
                            : "bg-black/10 text-text-secondary"
                      }`}
                    >
                      {entry.result === "win"
                        ? "W"
                        : entry.result === "lose"
                          ? "L"
                          : "T"}
                    </div>
                    <div>
                      <span
                        className={`text-[10px] font-semibold font-sans px-2 py-0.5 rounded-full border ${MODE_COLORS[entry.mode]}`}
                      >
                        {MODE_LABELS[entry.mode]}
                      </span>
                      <p className="text-text-secondary text-[10px] font-sans mt-1">
                        {formatDate(entry.timestamp)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-bold font-display ${
                        entry.amount > 0
                          ? "text-success"
                          : entry.amount < 0
                            ? "text-error"
                            : "text-text-secondary"
                      }`}
                    >
                      {formatAmount(entry.amount, entry.mode)}
                    </p>
                    <p className="text-text-secondary text-[10px] font-sans">
                      IDRX
                    </p>
                  </div>
                  <div className="shrink-0 ml-3" />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── CREATOR TAB ── */}
      {tab === "creator" && (
        <>
          {/* Royalty balance card */}
          <div className="bg-bg-card rounded-2xl p-4 mb-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-text-secondary text-xs font-sans">
                  Total Withdrawable
                </p>
                <p
                  className={`font-bold font-display text-xl ${pendingRoyalty > 0 ? "text-success" : "text-text-secondary"}`}
                >
                  Rp {formatIdrx(pendingRoyalty)}
                </p>
              </div>
              <Button
                onClick={handleWithdraw}
                loading={withdrawing}
                disabled={pendingRoyalty === 0 || withdrawing}
                size="sm"
              >
                Withdraw
              </Button>
            </div>
            {withdrawError && (
              <p className="text-error text-xs font-sans mt-2">
                {withdrawError}
              </p>
            )}
            {withdrawSuccess && (
              <p className="text-success text-xs font-sans mt-2">
                {withdrawSuccess}
              </p>
            )}
          </div>

          {/* Questions list */}
          {creatorLoading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : creatorError ? (
            <div className="bg-error/10 border border-error/30 rounded-2xl px-4 py-3 text-error text-sm font-sans text-center">
              {creatorError}
            </div>
          ) : questions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-primary/60"
                  aria-hidden="true"
                  focusable="false"
                >
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <path d="M12 8v8M8 12h8" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-text-primary text-sm font-semibold font-sans mb-1">
                  No questions yet
                </p>
                <p className="text-text-secondary text-xs font-sans">
                  Submit a picture question and earn royalties every time
                  it&apos;s played.
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/contribute")}
                className="px-5 py-2.5 rounded-2xl bg-primary text-white text-sm font-semibold font-sans shadow-sm active:scale-95 transition-transform"
              >
                Create Question
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {questions.map((q) => (
                <div
                  key={q.id}
                  className="bg-bg-card rounded-2xl p-3 flex items-center gap-3 shadow-sm"
                >
                  {/* Thumbnail */}
                  <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-black/5 shrink-0 flex items-center justify-center">
                    {q.imageUrl ? (
                      <Image
                        src={q.imageUrl}
                        alt={`Question ${q.id}`}
                        fill
                        unoptimized
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : (
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="text-text-secondary/30"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-text-primary text-sm font-bold font-display">
                        #{q.id}
                      </span>
                      <span
                        className={`text-[10px] font-semibold font-sans px-2 py-0.5 rounded-full border ${
                          q.isVerified
                            ? "text-success bg-success/10 border-success/30"
                            : q.reviewStatus === "rejected"
                              ? "text-error bg-error/10 border-error/30"
                              : "text-text-secondary bg-black/5 border-black/10"
                        }`}
                      >
                        {q.isVerified
                          ? "Verified"
                          : q.reviewStatus === "rejected"
                            ? "Rejected"
                            : "Pending"}
                      </span>
                    </div>
                    <p className="text-text-secondary text-[10px] font-sans">
                      {q.timesPlayed} {q.timesPlayed === 1 ? "play" : "plays"}
                    </p>
                  </div>

                  {/* Earnings */}
                  <div className="text-right shrink-0">
                    <p
                      className={`text-sm font-bold font-display ${q.earned > 0 ? "text-success" : "text-text-secondary"}`}
                    >
                      Rp {formatIdrx(q.earned)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
