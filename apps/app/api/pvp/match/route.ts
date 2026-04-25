import { NextResponse } from "next/server";
import { redis } from "../../../../lib/redis/client";
import { parseRedisJson } from "../../../../lib/redis/json";
import { publicClient } from "../../../../lib/viem/client";
import {
  gameSessionContract,
  questionPoolContract,
} from "../../../../lib/viem/contracts";

const PENDING_QUEUE_KEY = "pvp:pending:queue";
const SESSION_META_PREFIX = "pvp:session:meta:";
const SESSION_TTL_SECONDS = 60 * 10;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type SessionMeta = {
  playerAddress: string;
  createdAt: number;
};

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

async function getRandomQuestionIds() {
  const seed = BigInt(Math.floor(Math.random() * 1e12));
  const ids = (await publicClient.readContract({
    ...questionPoolContract,
    functionName: "getRandomQuestions",
    args: [10n, seed],
  })) as bigint[];
  return ids.map((id) => Number(id));
}

async function getSessionMeta(sessionId: string): Promise<SessionMeta | null> {
  const raw = await redis.get<unknown>(`${SESSION_META_PREFIX}${sessionId}`);
  if (!raw) return null;
  try {
    return parseRedisJson<SessionMeta>(raw);
  } catch {
    return null;
  }
}

async function removeFromQueue(sessionId: string) {
  await redis.lrem(PENDING_QUEUE_KEY, 0, sessionId);
  await redis.del(`${SESSION_META_PREFIX}${sessionId}`);
}

async function checkOnChainSessionUsable(sessionId: string): Promise<{
  usable: boolean;
  status: number;
}> {
  try {
    const session = (await publicClient.readContract({
      ...gameSessionContract,
      functionName: "sessions",
      args: [sessionId as `0x${string}`],
    })) as SessionTuple;

    const player1 = session[1];
    const status = session[9];
    const playDeadline = session[10];
    const now = BigInt(Math.floor(Date.now() / 1000));

    if (
      player1.toLowerCase() === ZERO_ADDRESS ||
      status !== 0 ||
      playDeadline <= now
    ) {
      return { usable: false, status };
    }
    return { usable: true, status };
  } catch {
    return { usable: false, status: -1 };
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: "find" | "register" | "claim";
      playerAddress?: string;
      sessionId?: string;
      questionIds?: number[];
    };

    if (body.action === "register") {
      if (
        !body.playerAddress ||
        !body.sessionId ||
        !Array.isArray(body.questionIds)
      ) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }

      const meta: SessionMeta = {
        playerAddress: body.playerAddress,
        createdAt: Date.now(),
      };
      await redis.set(
        `${SESSION_META_PREFIX}${body.sessionId}`,
        JSON.stringify(meta),
        { ex: SESSION_TTL_SECONDS },
      );
      await redis.rpush(PENDING_QUEUE_KEY, body.sessionId);
      await redis.expire(PENDING_QUEUE_KEY, SESSION_TTL_SECONDS);
      await redis.set(
        `pvp:${body.sessionId}:q`,
        JSON.stringify(body.questionIds),
        { ex: 3600 },
      );

      return NextResponse.json({ ok: true });
    }

    if (body.action === "claim") {
      if (!body.sessionId) {
        return NextResponse.json(
          { error: "Missing sessionId" },
          { status: 400 },
        );
      }
      await removeFromQueue(body.sessionId);
      return NextResponse.json({ ok: true });
    }

    // action === "find"
    if (!body.playerAddress) {
      return NextResponse.json(
        { error: "Missing playerAddress" },
        { status: 400 },
      );
    }

    const allPending = await redis.lrange<string>(PENDING_QUEUE_KEY, 0, -1);

    for (const sessionId of allPending) {
      const meta = await getSessionMeta(sessionId);
      if (!meta) {
        await redis.lrem(PENDING_QUEUE_KEY, 0, sessionId);
        continue;
      }

      const { usable } = await checkOnChainSessionUsable(sessionId);
      if (!usable) {
        await removeFromQueue(sessionId);
        continue;
      }

      if (meta.playerAddress.toLowerCase() === body.playerAddress.toLowerCase()) {
        return NextResponse.json({ action: "resume", sessionId });
      }

      return NextResponse.json({ action: "join", sessionId });
    }

    const questionIds = await getRandomQuestionIds();
    return NextResponse.json({ action: "create", questionIds });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
