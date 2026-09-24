import { pumaVerifiedSchema } from '../puma';
import { feedProductSchema, type FeedProduct, type SourceAdapter } from './adapters';
import { seaClient } from './seatable-client';
import { IntegrationError } from './http';

export function pumaFeedProduct(raw: unknown, now = Date.now()): FeedProduct | null {
  const parsed = pumaVerifiedSchema.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  const fresh = (t: string) => Date.parse(t) <= now + 60000 && now - Date.parse(t) <= 36 * 3600000;
  if (!fresh(p.checked_at)) return null;
  const variants = p.variants.filter((v) => fresh(v.checkedAt));
  if (!variants.length) return null;
  const lowest = variants.reduce((a, b) => (Number(a.salePrice) <= Number(b.salePrice) ? a : b));
  // Одна зачёркнутая цена допустима лишь при одинаковой исходной цене всех размеров.
  const original =
    new Set(variants.map((v) => v.originalPrice)).size === 1 ? lowest.originalPrice : null;
  return feedProductSchema.parse({
    id: p.sku,
    sku: p.sku,
    brand: 'Puma',
    name: p.name,
    productUrl: p.product_url,
    imageUrl: p.image_url,
    offerKind: 'retail',
    purchaseType: 'fixed',
    market: 'US',
    // Подтверждён американский магазин; физический склад не заявляется.
    currency: 'USD',
    originalPrice: original,
    salePrice: lowest.salePrice,
    sizes: variants.map((v) => v.sizeEU),
    sizePrices: variants.map((v) => ({ size: v.sizeEU, salePrice: v.salePrice })),
    gender: p.gender,
    category: 'Кроссовки',
    available: true,
    sourceUpdatedAt: new Date(
      Math.min(...variants.map((v) => Date.parse(v.checkedAt))),
    ).toISOString(),
  });
}

export class PumaAdapter implements SourceAdapter {
  id = 'puma-us';
  name = 'Puma US';
  configurationMessage =
    'Автоматическая проверка официального магазина США: наличие и цена выбранного размера.';
  configured() {
    return Boolean(process.env.SEATABLE_API_TOKEN && process.env.DATABASE_PROVIDER === 'seatable');
  }
  async fetchProducts() {
    const rows = await seaClient.rows('STEPPE_Scrapes');
    const latest = rows
      .filter((r) => !String(r.id).includes(':'))
      .sort((a, b) => String(b.checked_at).localeCompare(String(a.checked_at)))[0];
    if (!latest) return [];
    if (Date.now() - Date.parse(String(latest.checked_at)) > 36 * 3600000)
      throw new IntegrationError('PUMA_SCRAPE_STALE');
    const header = JSON.parse(String(latest.payload));
    const status = header.reports?.find((r: { source: string }) => r.source === 'puma');
    if (!status || ['error', 'needs_permission', 'time_limit'].includes(status.status))
      throw new IntegrationError('PUMA_SCRAPE_FAILED');
    const result = rows
      .filter((r) => String(r.id).startsWith(`${latest.id}:`))
      .flatMap((r) => {
        const p = pumaFeedProduct(JSON.parse(String(r.payload)));
        return p ? [p] : [];
      });
    if (new Set(result.map((p) => p.id)).size !== result.length)
      throw new IntegrationError('PUMA_DUPLICATE_PRODUCT');
    return result;
  }
}
