"use client";

import {
  getEmbeddedConnectedWallet,
  useActiveWallet,
  usePrivy,
  useUser,
  useWallets,
} from "@privy-io/react-auth";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, WalletClient } from "viem";
import { createWalletClient, custom } from "viem";
import { monadTestnet } from "../lib/viem/chain";

interface WalletState {
  address: Address | null;
  walletClient: WalletClient | null;
  isConnected: boolean;
  isReady: boolean;
  walletClientType: string | null;
  connectorType: string | null;
}

type PrivyWallet = NonNullable<
  ReturnType<typeof useWallets>["wallets"]
>[number];

type LinkedAccount = NonNullable<
  ReturnType<typeof useUser>["user"]
>["linkedAccounts"][number];

function getLatestVerifiedAccount(linkedAccounts: LinkedAccount[]) {
  return linkedAccounts.reduce<LinkedAccount | null>((latest, account) => {
    const ts = account.latestVerifiedAt?.getTime() ?? 0;
    const latestTs = latest?.latestVerifiedAt?.getTime() ?? 0;
    return ts > latestTs ? account : latest;
  }, null);
}

function pickPreferredWallet(
  wallets: PrivyWallet[],
  linkedAccounts: LinkedAccount[],
  activeWallet?: PrivyWallet | null,
) {
  const embeddedWallet =
    getEmbeddedConnectedWallet(wallets) ??
    wallets.find((wallet) => wallet.connectorType === "embedded") ??
    null;
  const latestVerifiedAccount = getLatestVerifiedAccount(linkedAccounts);

  if (latestVerifiedAccount?.type !== "wallet" && embeddedWallet) {
    return embeddedWallet;
  }

  if (
    latestVerifiedAccount?.type === "wallet" &&
    latestVerifiedAccount.walletClientType === "privy" &&
    embeddedWallet
  ) {
    return embeddedWallet;
  }

  if (activeWallet) {
    return activeWallet;
  }

  return (
    embeddedWallet ??
    wallets.find((wallet) => wallet.linked) ??
    wallets[0] ??
    null
  );
}

export function useWallet() {
  const {
    login,
    logout,
    authenticated,
    ready: privyReady,
    createWallet,
  } = usePrivy();
  const { user } = useUser();
  const { wallets, ready: walletsReady } = useWallets();
  const { wallet: activeWallet } = useActiveWallet();
  const [state, setState] = useState<WalletState>({
    address: null,
    walletClient: null,
    isConnected: false,
    isReady: false,
    walletClientType: null,
    connectorType: null,
  });
  const connectedForAddress = useRef<string | null>(null);
  const creatingWallet = useRef(false);
  // Refs for all Privy values that are unstable across renders
  const walletsRef = useRef(wallets);
  walletsRef.current = wallets;
  const createWalletRef = useRef(createWallet);
  createWalletRef.current = createWallet;

  const walletCount = wallets.length;
  const selectedWallet = pickPreferredWallet(
    wallets,
    user?.linkedAccounts ?? [],
    activeWallet && "getEthereumProvider" in activeWallet ? activeWallet : null,
  );
  const selectedWalletAddress = selectedWallet?.address ?? null;

  useEffect(() => {
    if (!privyReady) return;

    if (!authenticated) {
      setState({
        address: null,
        walletClient: null,
        isConnected: false,
        isReady: true,
        walletClientType: null,
        connectorType: null,
      });
      connectedForAddress.current = null;
      creatingWallet.current = false;
      return;
    }

    if (!walletsReady) return;

    if (walletCount === 0) {
      if (!creatingWallet.current) {
        creatingWallet.current = true;
        createWalletRef.current().catch(() => {
          creatingWallet.current = false;
          setState((s) => ({ ...s, isReady: true }));
        });
      }
      return;
    }

    if (
      connectedForAddress.current === selectedWalletAddress &&
      selectedWalletAddress !== null
    )
      return;

    async function connect() {
      connectedForAddress.current = selectedWalletAddress;
      const wallet =
        walletsRef.current.find(
          (candidate) => candidate.address === selectedWalletAddress,
        ) ?? walletsRef.current[0];
      try {
        const provider = await wallet.getEthereumProvider();
        const client = createWalletClient({
          chain: monadTestnet,
          transport: custom(provider),
        });
        const [addr] = await client.getAddresses();
        connectedForAddress.current = addr;
        setState({
          address: addr,
          walletClient: client,
          isConnected: true,
          isReady: true,
          walletClientType: wallet.walletClientType ?? null,
          connectorType: wallet.connectorType ?? null,
        });
      } catch {
        connectedForAddress.current = null;
        setState((s) => ({ ...s, isReady: true }));
      }
    }

    connect();
    // All Privy functions/arrays are unstable refs — only primitives in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    privyReady,
    walletsReady,
    authenticated,
    walletCount,
    selectedWalletAddress,
  ]);

  const handleLogin = useCallback(async () => {
    if (!authenticated) {
      await login();
      return;
    }
    if (walletsRef.current.length === 0) {
      try {
        await createWalletRef.current();
      } catch {
        // wallet may already exist or creation in progress
      }
    }
  }, [authenticated, login]);

  const handleLogout = useCallback(async () => {
    await logout();
    connectedForAddress.current = null;
    setState({
      address: null,
      walletClient: null,
      isConnected: false,
      isReady: true,
      walletClientType: null,
      connectorType: null,
    });
  }, [logout]);

  return {
    ...state,
    isMiniPay: false,
    login: handleLogin,
    logout: handleLogout,
  };
}
