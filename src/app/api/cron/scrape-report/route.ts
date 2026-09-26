import { githubCatalogEnabled } from '@/lib/server/github-catalog';
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { scrapeReportSchema, storeScrapeReport } from '@/lib/server/scrape-report';
import { decodeScrapeBody, maxScrapeWireBytes } from '@/lib/scrape-transfer';
import { safeCode } from '@/lib/server/http';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32)
    return NextResponse.json({ error: 'Не настроено' }, { status: 503 });
  const supplied = Buffer.from(req.headers.get('authorization') || ''),
    expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  if (githubCatalogEnabled())
    return NextResponse.json(
      { error: 'Каталог обновляется через GitHub: build-catalog.ts и publish-catalog.mjs.' },
      { status: 409 },
    );
  if (Number(req.headers.get('content-length')) > maxScrapeWireBytes)
    return NextResponse.json({ error: 'Слишком большой отчёт' }, { status: 413 });
  try {
    let text;
    try {
      text = decodeScrapeBody(
        new Uint8Array(await req.arrayBuffer()),
        req.headers.get('content-encoding'),
      );
    } catch {
      return NextResponse.json(
        { error: 'Некорректный или слишком большой отчёт' },
        { status: 413 },
      );
    }
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
  } catch (error) {
    const code = safeCode(error);
    console.error(JSON.stringify({ event: 'scrape_report_store_failed', code }));
    return NextResponse.json(
      {
        error:
          code === 'UPSTREAM_QUOTA_EXHAUSTED'
            ? 'Лимит запросов к базе исчерпан. Увеличьте квоту SeaTable или дождитесь её сброса.'
            : 'Не удалось сохранить отчёт',
        code,
      },
      { status: 503 },
    );
  }
}
