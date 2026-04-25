import { createWalletClient, createPublicClient, http, parseUnits, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from '../../../lib/viem/chain';
import { NextResponse } from 'next/server';

// Rp 50,000 = 5_000_000 in IDRX (2 decimals)
const IDRX_AMOUNT = parseUnits('50000', 2);
const MON_AMOUNT = parseEther('1');
const COOLDOWN_MS = 8 * 60 * 60 * 1000;
const MONAD_RPC = 'https://testnet-rpc.monad.xyz';

const lastClaimIdrx = new Map<string, number>();
const lastClaimMon = new Map<string, number>();

const FAUCET_PRIVATE_KEY = process.env.FAUCET_PRIVATE_KEY;
const IDRX_ADDRESS = (process.env.NEXT_PUBLIC_MOCK_IDRX_ADDRESS ?? '') as `0x${string}`;

const MINT_ABI = [
  {
    type: 'function',
    name: 'mint',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address');
  const type = searchParams.get('type') ?? 'idrx';
  if (!address) return NextResponse.json({ cooldownUntil: 0 });
  const map = type === 'mon' ? lastClaimMon : lastClaimIdrx;
  const last = map.get(address.toLowerCase()) ?? 0;
  return NextResponse.json({ cooldownUntil: last + COOLDOWN_MS });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { address, type = 'idrx' } = body;

  if (!FAUCET_PRIVATE_KEY) {
    return NextResponse.json({ error: 'Faucet not configured' }, { status: 500 });
  }

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const key = (address as string).toLowerCase();
  const now = Date.now();
  const map = type === 'mon' ? lastClaimMon : lastClaimIdrx;
  const last = map.get(key) ?? 0;
  const remaining = COOLDOWN_MS - (now - last);

  if (remaining > 0) {
    return NextResponse.json(
      { error: 'Cooldown active', cooldownUntil: last + COOLDOWN_MS },
      { status: 429 },
    );
  }

  try {
    const account = privateKeyToAccount(FAUCET_PRIVATE_KEY as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(MONAD_RPC),
    });
    const publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http(MONAD_RPC),
    });

    let hash: `0x${string}`;

    if (type === 'mon') {
      hash = await walletClient.sendTransaction({
        to: address as `0x${string}`,
        value: MON_AMOUNT,
      });
    } else {
      hash = await walletClient.writeContract({
        address: IDRX_ADDRESS,
        abi: MINT_ABI,
        functionName: 'mint',
        args: [address as `0x${string}`, IDRX_AMOUNT],
      });
    }

    await publicClient.waitForTransactionReceipt({ hash });
    map.set(key, now);

    return NextResponse.json({ hash, cooldownUntil: now + COOLDOWN_MS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Faucet failed';
    const userMsg = /insufficient funds|out of gas/i.test(msg)
      ? 'Faucet is out of funds. Please try again later.'
      : 'Faucet error. Please try again.';
    return NextResponse.json({ error: userMsg }, { status: 500 });
  }
}
