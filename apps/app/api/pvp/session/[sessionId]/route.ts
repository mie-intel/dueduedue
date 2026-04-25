import { NextResponse } from "next/server";
import { redis } from "../../../../../lib/redis/client";
import { parseRedisArray } from "../../../../../lib/redis/json";
import { publicClient } from "../../../../../lib/viem/client";
import { gameSessionContract } from "../../../../../lib/viem/contracts";

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;

    const session = (await publicClient.readContract({
      ...gameSessionContract,
      functionName: "sessions",
      args: [sessionId as `0x${string}`],
    })) as SessionTuple;

    const qRaw = await redis.get<unknown>(`pvp:${sessionId}:q`);
    const questionIds = parseRedisArray<string | number | bigint>(qRaw).map(
      String,
    );
    const winner = await redis.get<string>(`pvp:${sessionId}:winner`);

    return NextResponse.json({
      id: sessionId,
      player1: session[1],
      player2: session[2],
      wager: session[3].toString(),
      status: session[9],
      questionIds,
      winner: winner ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
