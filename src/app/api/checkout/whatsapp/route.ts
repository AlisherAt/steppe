import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cartProducts } from '@/lib/server/cart-products';
import { CheckoutError, whatsappOrder } from '@/lib/whatsapp';
import { orderPhone } from '@/lib/store-contact';
export const runtime = 'nodejs';
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(req: NextRequest) {
  if (
    req.headers.get('origin') !== req.nextUrl.origin ||
    !req.headers.get('content-type')?.startsWith('application/json')
  )
    return json({ error: 'Недопустимый запрос.' }, 403);
  try {
    const text = await req.text();
    if (text.length > 10000) return json({ error: 'Слишком большая корзина.' }, 413);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: 'Некорректная корзина.' }, 400);
    }
    const parsed = z
      .object({
        items: z
          .array(z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), size: z.string().max(20) }))
          .min(1)
          .max(50),
      })
      .safeParse(body);
    if (!parsed.success) return json({ error: 'Некорректная корзина.' }, 400);
    const products = await cartProducts([...new Set(parsed.data.items.map((i) => i.id))]);
    return json({
      url: whatsappOrder(orderPhone, parsed.data.items, products),
    });
  } catch (e) {
    if (e instanceof CheckoutError) return json({ error: e.message }, 409);
    console.error('whatsapp_checkout_failed');
    return json({ error: 'Не удалось проверить товары. Попробуйте ещё раз.' }, 503);
  }
}
