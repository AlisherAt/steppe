import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, databaseConfigured, databaseProvider } from '@/lib/server/db';
import { seaStore } from '@/lib/server/seatable-store';
import { publicProduct } from '@/lib/public-product';
import { offerVisible } from '@/lib/promotion';
export async function POST(request: NextRequest) {
  if (Number(request.headers.get('content-length')) > 10000)
    return NextResponse.json({ error: 'Запрос слишком большой' }, { status: 413 });
  try {
    const text = await request.text();
    if (text.length > 10000)
      return NextResponse.json({ error: 'Запрос слишком большой' }, { status: 413 });
    const parsed = z
      .object({ ids: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(50) })
      .safeParse(JSON.parse(text));
    if (!parsed.success)
      return NextResponse.json({ error: 'Некорректная корзина' }, { status: 400 });
    if (!databaseConfigured())
      return NextResponse.json({ error: 'Каталог не подключён' }, { status: 503 });
    if (databaseProvider() === 'seatable') {
      const products = (await seaStore.liveProducts()).filter((p) =>
        parsed.data.ids.includes(p.id),
      );
      return NextResponse.json(
        { products: products.map(publicProduct) },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const { data, error } = await db()
      .from('offers')
      .select('payload,updated_at,sources!inner(paused)')
      .in('id', parsed.data.ids)
      .eq('active', true)
      .eq('sources.paused', false);
    if (error) throw error;
    return NextResponse.json(
      {
        products: data
          .filter((p) => offerVisible({ ...p.payload, updatedAt: p.updated_at }))
          .map((p) => publicProduct(p.payload)),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Не удалось проверить товары' }, { status: 503 });
  }
}
