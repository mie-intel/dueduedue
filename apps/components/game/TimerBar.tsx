'use client';

import { useEffect, useState, useRef } from 'react';

interface TimerBarProps {
  durationMs: number;
  onExpire: () => void;
  resetKey: number;
}

export default function TimerBar({ durationMs, onExpire, resetKey }: TimerBarProps) {
  const [remaining, setRemaining] = useState(durationMs);
  const endRef = useRef(Date.now() + durationMs);
  const expiredRef = useRef(false);

  useEffect(() => {
    endRef.current = Date.now() + durationMs;
    expiredRef.current = false;
    setRemaining(durationMs);

    const id = setInterval(() => {
      const left = Math.max(0, endRef.current - Date.now());
      setRemaining(left);
      if (left === 0 && !expiredRef.current) {
        expiredRef.current = true;
        clearInterval(id);
        onExpire();
      }
    }, 50);

    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, durationMs]);

  const pct = (remaining / durationMs) * 100;
  const color = pct > 50 ? 'bg-success' : pct > 25 ? 'bg-secondary-dark' : 'bg-error';

  return (
    <div className="w-full h-1.5 bg-bg-page rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
