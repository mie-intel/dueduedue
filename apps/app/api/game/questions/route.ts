import { NextResponse } from 'next/server';
import { publicClient } from '../../../../lib/viem/client';
import { questionPoolContract } from '../../../../lib/viem/contracts';
import { redis } from '../../../../lib/redis/client';

const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? 'https://gateway.pinata.cloud';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get('ids');

    let questionIds: number[];

    if (idsParam) {
      questionIds = idsParam.split(',').map(Number).filter(Boolean);
    } else {
      const count = Math.min(Number(searchParams.get('count') ?? 5), 10);
      const seed = BigInt(searchParams.get('seed') ?? Math.floor(Math.random() * 1e12));

      let ids: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          ids = await publicClient.readContract({
            ...questionPoolContract,
            functionName: 'getRandomQuestions',
            args: [BigInt(count), seed],
          });
          break;
        } catch (err) {
          if (attempt === 2) throw err;
          await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
        }
      }
      questionIds = (ids as bigint[]).map(Number);
    }

    if (questionIds.length === 0) {
      return NextResponse.json({ error: 'No questions available' }, { status: 404 });
    }

    const questions = await Promise.all(
      questionIds.map(async (id) => {
        const imageUrl = await redis.get<string>(`question:${id}:imageUrl`);
        if (imageUrl) return { id, imageUrl };

        try {
          const question = await publicClient.readContract({
            ...questionPoolContract,
            functionName: 'questions',
            args: [BigInt(id)],
          }) as [bigint, `0x${string}`, string, boolean, number, bigint, bigint];
          const ipfsHash = question[2];
          return ipfsHash ? { id, imageUrl: `${IPFS_GATEWAY}/ipfs/${ipfsHash}` } : null;
        } catch {
          return null;
        }
      })
    );

    const valid = questions.filter(Boolean) as { id: number; imageUrl: string }[];
    return NextResponse.json({ questions: valid });
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Failed';
    const msg = raw.includes('fetch failed') || raw.includes('HTTP request failed')
      ? 'Network error — Monad RPC unreachable. Check connection and retry.'
      : raw;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
