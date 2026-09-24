import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { databaseConfigured } from '@/lib/server/db';
import { refreshSources } from '@/lib/server/refresh';
import { safeCode } from '@/lib/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32)
    return NextResponse.json({ error: 'Планировщик не настроен.' }, { status: 503 });
  const supplied = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return NextResponse.json({ error: 'Нет доступа.' }, { status: 401 });
  if (!databaseConfigured())
    return NextResponse.json({ error: 'База данных не подключена.' }, { status: 503 });
  try {
    const result = await refreshSources();
    return NextResponse.json(result, {
      status: 'results' in result && result.results?.some((r) => r.status === 'error') ? 502 : 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error(JSON.stringify({ event: 'refresh_failed', code: safeCode(e) }));
    return NextResponse.json({ error: 'Обновление не завершено.' }, { status: 503 });
  }
}
export const GET = POST;
