import { NextRequest, NextResponse } from 'next/server';
import { redis } from '../../../../../lib/redis/client';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = await redis.get<string>(`contribute:${id}`);
  if (!raw) return NextResponse.json({ status: 'not_found' }, { status: 404 });
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return NextResponse.json(data);
}
