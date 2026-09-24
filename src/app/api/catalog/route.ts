import { NextRequest, NextResponse } from 'next/server';
import { filtersSchema } from '@/lib/catalog';
import { getCatalog } from '@/lib/server/repository';
import { demoEnabled } from '@/lib/catalog-mode';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const filters = filtersSchema.safeParse(Object.fromEntries(params));
  const mode = params.get('mode') || 'live';
  if (!filters.success || !['live', 'demo'].includes(mode))
    return NextResponse.json(
      { error: 'Проверьте параметры поиска и диапазон цен.' },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await getCatalog(filters.data, mode === 'demo' && demoEnabled() ? 'demo' : 'live'),
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch {
    console.error(JSON.stringify({ event: 'catalog_read_failed' }));
    return NextResponse.json(
      { error: 'Не удалось загрузить предложения. Попробуйте ещё раз.' },
      { status: 503 },
    );
  }
}
