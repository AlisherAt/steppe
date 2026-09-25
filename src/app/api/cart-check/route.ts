import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { databaseConfigured } from '@/lib/server/db';
import { publicProduct } from '@/lib/public-product';
import { cartProducts } from '@/lib/server/cart-products';
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
    const products = await cartProducts(parsed.data.ids);
    return NextResponse.json(
      { products: products.map(publicProduct) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Не удалось проверить товары' }, { status: 503 });
  }
}
