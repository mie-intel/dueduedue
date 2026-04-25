import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { redis } from "../../../../../lib/redis/client";
import { parseRedisArray } from "../../../../../lib/redis/json";
import { monadTestnet } from "../../../../../lib/viem/chain";
import {
  gameSessionAbi,
  gameSessionContract,
} from "../../../../../lib/viem/contracts";

const MONAD_RPC = "https://testnet-rpc.monad.xyz";

type SessionTuple = readonly [
  `0x${string}`,
  `0x${string}`,
  `0x${string}`,
  bigint,
  number,
  `0x${string}`,
  `0x${string}`,
  number,
  number,
  number,
  bigint,
  bigint,
];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const { playerAddress, answers } = await req.json();

    if (!playerAddress || !Array.isArray(answers)) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const session = await fetchSession(sessionId);
    const isPlayer1 =
      session.player1.toLowerCase() === playerAddress.toLowerCase();
    const isPlayer2 =
      session.player2.toLowerCase() === playerAddress.toLowerCase();
    if (!isPlayer1 && !isPlayer2) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    const key = isPlayer1 ? `pvp:${sessionId}:p1` : `pvp:${sessionId}:p2`;
    await redis.set(key, JSON.stringify(answers), { ex: 3600 });

    const p1Raw = await redis.get<unknown>(`pvp:${sessionId}:p1`);
    const p2Raw = await redis.get<unknown>(`pvp:${sessionId}:p2`);

    if (!p1Raw || !p2Raw) {
      return NextResponse.json({ status: "waiting_for_opponent" });
    }

    const qRaw = await redis.get<unknown>(`pvp:${sessionId}:q`);
    const questionIds = parseRedisArray<string | number | bigint>(qRaw).map(
      String,
    );
    const p1Answers = parseRedisArray<string>(p1Raw);
    const p2Answers = parseRedisArray<string>(p2Raw);

    let score1 = 0,
      score2 = 0;
    for (let i = 0; i < questionIds.length; i++) {
      const correctAnswer = await redis.get<string>(
        `question:${questionIds[i]}:answer`,
      );
      if (!correctAnswer) continue;
      if ((p1Answers[i] ?? "").trim().toUpperCase() === correctAnswer) score1++;
      if ((p2Answers[i] ?? "").trim().toUpperCase() === correctAnswer) score2++;
    }

    const winner =
      score1 > score2
        ? session.player1
        : score2 > score1
          ? session.player2
          : "tie";

    try {
      const faucetKey = process.env.FAUCET_PRIVATE_KEY as `0x${string}`;
      const account = privateKeyToAccount(faucetKey);
      const walletRelayer = createWalletClient({
        account,
        chain: monadTestnet,
        transport: http(MONAD_RPC),
      });
      const pubClient = createPublicClient({
        chain: monadTestnet,
        transport: http(MONAD_RPC),
      });

      const resolveHash = await walletRelayer.writeContract({
        address: gameSessionContract.address,
        abi: gameSessionAbi,
        functionName: "resolveByRelayer",
        args: [
          sessionId as `0x${string}`,
          winner === "tie"
            ? "0x0000000000000000000000000000000000000000"
            : winner,
          score1,
          score2,
        ],
      });
      await pubClient.waitForTransactionReceipt({ hash: resolveHash });
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Failed to resolve PvP session";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    await redis.set(`pvp:${sessionId}:winner`, winner, { ex: 3600 });

    return NextResponse.json({ status: "resolved", winner, score1, score2 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function fetchSession(sessionId: string) {
  const { publicClient } = await import("../../../../../lib/viem/client");
  const { gameSessionContract } = await import(
    "../../../../../lib/viem/contracts"
  );
  const session = (await publicClient.readContract({
    ...gameSessionContract,
    functionName: "sessions",
    args: [sessionId as `0x${string}`],
  })) as SessionTuple;
  return {
    player1: session[1],
    player2: session[2],
    status: session[9],
  };
}
