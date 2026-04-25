'use client';

import { useState, useCallback } from 'react';
import type { Abi, ContractFunctionName, ContractFunctionArgs } from 'viem';
import { useWallet } from './useWallet';
import { publicClient } from '../lib/viem/client';

type WriteState = {
  isPending: boolean;
  isSuccess: boolean;
  error: string | null;
  hash: `0x${string}` | null;
};

export function useContractWrite() {
  const { walletClient, address } = useWallet();
  const [state, setState] = useState<WriteState>({
    isPending: false,
    isSuccess: false,
    error: null,
    hash: null,
  });

  const writeContract = useCallback(
    async <
      TAbi extends Abi,
      TFunctionName extends ContractFunctionName<TAbi, 'nonpayable' | 'payable'>,
    >(params: {
      address: `0x${string}`;
      abi: TAbi;
      functionName: TFunctionName;
      args?: ContractFunctionArgs<TAbi, 'nonpayable' | 'payable', TFunctionName>;
      value?: bigint;
    }): Promise<`0x${string}` | null> => {
      if (!walletClient || !address) {
        setState((s) => ({ ...s, error: 'Wallet not connected' }));
        return null;
      }

      setState({ isPending: true, isSuccess: false, error: null, hash: null });

      try {
        const { request } = await publicClient.simulateContract({
          ...params,
          account: address,
        } as Parameters<typeof publicClient.simulateContract>[0]);

        const hash = await walletClient.writeContract(request as Parameters<typeof walletClient.writeContract>[0]);

        setState({ isPending: false, isSuccess: true, error: null, hash });
        return hash;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Transaction failed';
        const clean = msg.includes('User rejected') ? 'Transaction cancelled' : msg.split('\n')[0];
        setState({ isPending: false, isSuccess: false, error: clean, hash: null });
        return null;
      }
    },
    [walletClient, address],
  );

  const waitForTx = useCallback(async (hash: `0x${string}`) => {
    return publicClient.waitForTransactionReceipt({ hash });
  }, []);

  const reset = useCallback(() => {
    setState({ isPending: false, isSuccess: false, error: null, hash: null });
  }, []);

  return { writeContract, waitForTx, reset, ...state };
}
