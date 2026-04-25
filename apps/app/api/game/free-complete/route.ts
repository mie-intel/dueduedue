import { NextResponse } from 'next/server';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from '../../../../lib/viem/chain';
import { questionPoolContract, questionPoolAbi } from '../../../../lib/viem/contracts';

const MONAD_RPC = 'https://testnet-rpc.monad.xyz';

export async function POST(req: Request) {
  try {
    const { address } = await req.json();
    if (!address) return NextResponse.json({ error: 'Missing address' }, { status: 400 });

    const faucetKey = process.env.FAUCET_PRIVATE_KEY;
    if (!faucetKey) throw new Error('Relayer key not configured');

    const account = privateKeyToAccount(faucetKey as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: monadTestnet, transport: http(MONAD_RPC) });
    const publicClientServer = createPublicClient({ chain: monadTestnet, transport: http(MONAD_RPC) });

    const hash = await walletClient.writeContract({
      address: questionPoolContract.address,
      abi: questionPoolAbi,
      functionName: 'incrementDailyCount',
      args: [address as `0x${string}`],
    });
    await publicClientServer.waitForTransactionReceipt({ hash });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
