import { NextResponse } from 'next/server';
import { redis } from '../../../../lib/redis/client';

export async function POST(req: Request) {
  try {
    const { questionId, guess } = await req.json();
    if (!questionId || !guess) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const correct = await redis.get<string>(`question:${questionId}:answer`);
    if (!correct) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const isCorrect = guess.trim().toUpperCase() === correct.toUpperCase();
    return NextResponse.json({ correct: isCorrect });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
