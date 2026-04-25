"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { publicClient } from "../lib/viem/client";
import { gameSessionContract } from "../lib/viem/contracts";

const PVP_PAYOUT_REFRESH_MS = 60_000;

export function usePvpPayout(address?: string | null) {
  const [pendingPvpPayout, setPendingPvpPayout] = useState(0);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const clearPendingPvpPayout = useCallback(() => {
    setPendingPvpPayout(0);
  }, []);

  useEffect(() => {
    if (!address) {
      setPendingPvpPayout(0);
      setError("");
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const pending = (await publicClient.readContract({
          ...gameSessionContract,
          functionName: "pendingPvpPayout",
          args: [address as Address],
        })) as bigint;

        if (!cancelled) {
          setPendingPvpPayout(Number(pending));
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load PvP payout",
          );
        }
      }
    }

    void reloadKey;
    void load();

    const interval = setInterval(() => {
      void load();
    }, PVP_PAYOUT_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [address, reloadKey]);

  return {
    pendingPvpPayout,
    error,
    refresh,
    clearPendingPvpPayout,
  };
}
