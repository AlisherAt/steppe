import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/admin-access';
import { adminBody, adminError, adminJson } from '@/lib/server/admin-response';
import { manualProducts, publishSchema, urlKey } from '@/lib/server/manual-products';
import { seaStore } from '@/lib/server/seatable-store';
import { withSellingPrices } from '@/lib/selling-price';
import { offerVisible } from '@/lib/promotion';
import { AuthError } from '@/lib/server/auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    const user = await requireAdmin(req);
    const { products, records, hidden } = await manualProducts.combine(
      await seaStore.liveProducts(),
      true,
    );
    return adminJson({
      user: user.username,
      products: products.map((product) => ({
        product,
        selling: withSellingPrices(product),
        hidden: hidden.some((h) => h.id === product.id || h.url_key === urlKey(product.productUrl)),
        stale: !offerVisible(product),
        manual: records.some((r) => r.row.status === 'published' && r.product.id === product.id),
      })),
      drafts: records
        .filter((r) => r.row.status === 'draft')
        .map((r) => ({
          draftId: r.row.id,
          product: r.product,
          selling: withSellingPrices(r.product),
        })),
    });
  } catch (error) {
    return adminError(error);
  }
}
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req, true);
    const body = await adminBody(req);
    if (body.action === 'discard') {
      const id = z.string().uuid().parse(body.draftId);
      await manualProducts.discard(id);
      return adminJson({ discarded: true });
    }
    const product = await manualProducts.publish(publishSchema.parse(body));
    return adminJson({ published: true, id: product.id });
  } catch (error) {
    return adminError(error);
  }
}
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAdmin(req, true);
    const { id, restore } = z
      .object({ id: z.string().regex(/^[a-f0-9]{64}$/), restore: z.boolean().default(false) })
      .parse(await adminBody(req));
    const { products } = await manualProducts.combine(await seaStore.liveProducts(), true);
    const product = products.find((p) => p.id === id);
    if (!product) throw new AuthError(404, 'Товар не найден.');
    if (restore) await manualProducts.restore(id, product.productUrl);
    else await manualProducts.hide(product, user.id);
    return adminJson({ hidden: !restore });
  } catch (error) {
    return adminError(error);
  }
}
