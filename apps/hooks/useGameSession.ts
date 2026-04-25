'use client';

import { useState, useEffect, useCallback } from 'react';

export type SessionStatus = 0 | 1 | 2 | 3 | 4;

export interface SessionState {
  id: string;
  player1: string;
  player2: string;
  wager: string;
  status: SessionStatus;
  questionIds: string[];
  winner: string | null;
  loading: boolean;
  error: string | null;
}

export function useGameSession(sessionId: string | null, pollMs = 3000) {
  const [state, setState] = useState<SessionState>({
    id: '',
    player1: '',
    player2: '',
    wager: '0',
    status: 0,
    questionIds: [],
    winner: null,
    loading: true,
    error: null,
  });

  const poll = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await globalThis.fetch(`/api/pvp/session/${sessionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setState((prev) => ({ ...prev, ...data, loading: false, error: null }));
    } catch (e) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : 'Failed',
      }));
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    poll();
    const id = setInterval(poll, pollMs);
    return () => clearInterval(id);
  }, [sessionId, pollMs, poll]);

  return state;
}
