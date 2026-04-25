'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { monadTestnet } from '../lib/viem/chain';

export default function Providers({ children }: { children: React.ReactNode }) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!privyAppId) {
    throw new Error(
      'NEXT_PUBLIC_PRIVY_APP_ID is not defined. Please add it to your .env.local file'
    );
  }

  console.log('Privy App ID:', privyAppId); // Debug log

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['google', 'email', 'wallet'],
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' }, showWalletUIs: false },
        appearance: {
          walletList: ['metamask', 'rabby_wallet', 'wallet_connect', 'coinbase_wallet'],
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
