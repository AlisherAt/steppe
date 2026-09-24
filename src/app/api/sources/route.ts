import { NextResponse } from 'next/server';
import { getSources } from '@/lib/server/repository';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return NextResponse.json(
      { sources: await getSources() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Статус источников временно недоступен.' }, { status: 503 });
  }
}
