'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '../../hooks/useWallet';

export default function AutoSignBadge() {
  const { isConnected } = useWallet();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isConnected) return;
    const seen = localStorage.getItem('autosign_banner_seen');
    if (!seen) setVisible(true);
  }, [isConnected]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
      <div className="bg-bg-card border border-primary/30 rounded-2xl px-4 py-3 shadow-lg flex items-center gap-3 max-w-sm w-full pointer-events-auto">
        <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-semibold text-text-primary">Auto-Sign aktif</p>
          <p className="text-xs text-text-secondary mt-0.5">
            Transaksi game diproses otomatis — tidak perlu approve tiap kali main.
          </p>
        </div>
        <button
          onClick={() => {
            localStorage.setItem('autosign_banner_seen', '1');
            setVisible(false);
          }}
          className="text-text-secondary hover:text-text-primary text-lg leading-none shrink-0"
        >
          ×
        </button>
      </div>
    </div>
  );
}
