'use client';

import { useWallet } from '../../hooks/useWallet';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';

interface WalletGuardProps {
  children: React.ReactNode;
}

export default function WalletGuard({ children }: WalletGuardProps) {
  const { isConnected, isReady, login } = useWallet();

  if (!isReady) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 via-secondary/20 to-purple-400/20 border-2 border-primary/30 flex items-center justify-center text-5xl shadow-lg">
          🎮
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-display font-bold text-text-primary mb-2">
            Connect Wallet
          </h2>
          <p className="text-text-secondary text-sm">
            Sign in with Google, MetaMask, or any Web3 wallet to play and earn
          </p>
        </div>
        <Button onClick={login} size="lg" className="w-full max-w-xs">
          Connect Wallet
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
