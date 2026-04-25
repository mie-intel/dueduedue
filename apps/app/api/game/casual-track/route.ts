import { NextResponse } from "next/server";
import { redis } from "../../../../lib/redis/client";

const EARNED_PER_PLAY = 4_500; // raw IDRX (2 decimals)

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get("ids");

    if (!idsParam) {
      return NextResponse.json({ metrics: [] });
    }

    const ids = idsParam
      .split(",")
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);

    const metrics = await Promise.all(
      ids.map(async (id) => {
        const [plays, earned] = await Promise.all([
          redis.get<number>(`question:${id}:paidPlays`),
          redis.get<number>(`question:${id}:earnedRaw`),
        ]);

        return {
          id,
          plays: Number(plays ?? 0),
          earned: Number(earned ?? 0),
        };
      }),
    );

    return NextResponse.json({ metrics });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Load failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { questionIds } = await req.json() as { questionIds?: number[] };

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return NextResponse.json(
        { error: "Missing questionIds" },
        { status: 400 },
      );
    }

    const ids = questionIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    await Promise.all(
      ids.map(async (id) => {
        const [currentPlays, currentEarned] = await Promise.all([
          redis.get<number>(`question:${id}:paidPlays`),
          redis.get<number>(`question:${id}:earnedRaw`),
        ]);

        await Promise.all([
          redis.set(`question:${id}:paidPlays`, Number(currentPlays ?? 0) + 1),
          redis.set(
            `question:${id}:earnedRaw`,
            Number(currentEarned ?? 0) + EARNED_PER_PLAY,
          ),
        ]);
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Track failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
