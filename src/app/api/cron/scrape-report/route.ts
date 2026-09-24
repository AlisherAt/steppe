import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { scrapeReportSchema, storeScrapeReport } from '@/lib/server/scrape-report';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32)
    return NextResponse.json({ error: 'Не настроено' }, { status: 503 });
  const supplied = Buffer.from(req.headers.get('authorization') || ''),
    expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  if (Number(req.headers.get('content-length')) > 3_000_000)
    return NextResponse.json({ error: 'Слишком большой отчёт' }, { status: 413 });
  try {
    const text = await req.text();
    if (text.length > 3_000_000)
      return NextResponse.json({ error: 'Слишком большой отчёт' }, { status: 413 });
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
    }
    const parsed = scrapeReportSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Некорректный отчёт' }, { status: 400 });
    if (Math.abs(Date.now() - Date.parse(parsed.data.checkedAt)) > 24 * 3600_000)
      return NextResponse.json({ error: 'Устаревший отчёт' }, { status: 400 });
    await storeScrapeReport(parsed.data);
    return NextResponse.json(
      { stored: true, collected: parsed.data.products.length, published: 0 },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    console.error('scrape_report_store_failed');
    return NextResponse.json({ error: 'Не удалось сохранить отчёт' }, { status: 503 });
  }
}
