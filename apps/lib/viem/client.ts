import { createPublicClient, http } from 'viem';
import { monadTestnet } from './chain';

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http('https://testnet-rpc.monad.xyz'),
});
