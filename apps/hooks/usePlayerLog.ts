'use client';

import { useState, useEffect, useCallback } from 'react';

export type GameMode = 'free' | 'casual' | 'competitive';
export type GameResult = 'win' | 'lose' | 'tie';

export interface GameLogEntry {
  id: string;
  mode: GameMode;
  result: GameResult;
  amount: number; // IDRX amount (positive = earned, negative = lost), 0 for free
  timestamp: number;
}

const STORAGE_KEY = 'duelpic_player_log';
const MAX_ENTRIES = 200;

function loadLog(address: string): GameLogEntry[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${address.toLowerCase()}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLog(address: string, entries: GameLogEntry[]) {
  try {
    localStorage.setItem(
      `${STORAGE_KEY}_${address.toLowerCase()}`,
      JSON.stringify(entries.slice(0, MAX_ENTRIES)),
    );
  } catch {}
}

export function usePlayerLog(address: string | null) {
  const [entries, setEntries] = useState<GameLogEntry[]>([]);

  useEffect(() => {
    if (!address) { setEntries([]); return; }
    setEntries(loadLog(address));
  }, [address]);

  const addEntry = useCallback(
    (entry: Omit<GameLogEntry, 'id' | 'timestamp'>) => {
      if (!address) return;
      const newEntry: GameLogEntry = {
        ...entry,
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
      };
      setEntries((prev) => {
        const updated = [newEntry, ...prev].slice(0, MAX_ENTRIES);
        saveLog(address, updated);
        return updated;
      });
    },
    [address],
  );

  const stats = {
    total: entries.length,
    wins: entries.filter((e) => e.result === 'win').length,
    losses: entries.filter((e) => e.result === 'lose').length,
    netProfitLoss: entries.reduce((sum, e) => sum + e.amount, 0),
  };

  return { entries, addEntry, stats };
}
