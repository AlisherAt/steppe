import { retailScrapeSchema } from '../retail-scrapes';
import { officialStores, retailStoreId } from '../official-stores';
import { feedProductSchema, type FeedProduct, type SourceAdapter } from './adapters';
import { seaClient } from './seatable-client';
import { IntegrationError } from './http';
export function retailScrapeProduct(raw: unknown, now = Date.now()): FeedProduct | null {
  const parsed = retailScrapeSchema.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  const fresh = (d: string) => Date.parse(d) <= now + 60000 && now - Date.parse(d) <= 36 * 3600000;
  if (!fresh(p.checked_at)) return null;
  const variants = p.variants.filter((v) => fresh(v.checkedAt));
  if (!variants.length) return null;
  const cheapest = variants.reduce((a, b) => (Number(a.salePrice) <= Number(b.salePrice) ? a : b));
  return feedProductSchema.parse({
    id: p.sku,
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    productUrl: p.product_url,
    imageUrl: p.image_url,
    offerKind: 'retail',
    purchaseType: 'fixed',
    market: p.source === 'fila' ? 'EU' : 'US',
    currency: p.currency,
    originalPrice:
      new Set(variants.map((v) => v.originalPrice)).size === 1 ? cheapest.originalPrice : null,
    salePrice: cheapest.salePrice,
    sizes: variants.map((v) => v.size),
    sizePrices: variants.map((v) => ({ size: v.size, salePrice: v.salePrice })),
    gender: p.gender,
    category: 'Кроссовки',
    available: true,
    sourceUpdatedAt: new Date(
      Math.min(...variants.map((v) => Date.parse(v.checkedAt))),
    ).toISOString(),
  });
}
export class ScrapedRetailAdapter implements SourceAdapter {
  id: string;
  name: string;
  configurationMessage = 'Проверка официального магазина: цены и наличие вариантов.';
  constructor(private source: 'adidas' | 'reebok' | 'on' | 'brooks' | 'skechers' | 'fila') {
    this.id = retailStoreId(source);
    this.name = `${officialStores[retailStoreId(source)].brand} ${source === 'fila' ? 'EU' : 'US'}`;
    if (source === 'adidas')
      this.configurationMessage =
        'Прямой сбор adidas US по расписанию. При HTTP 403 нужен допуск сборщика со стороны adidas. Публикуются только подтверждённые цены и размеры.';
    if (source === 'skechers')
      this.configurationMessage =
        'Skechers запрещает запросы выбора размеров в robots.txt. Нужен разрешённый фид вариантов или изменение доступа со стороны магазина.';
  }
  configured() {
    return Boolean(
      this.source !== 'skechers' &&
      process.env.SEATABLE_API_TOKEN &&
      (process.env.DATABASE_PROVIDER || 'seatable') === 'seatable',
    );
  }
  async fetchProducts() {
    const rows = await seaClient.rows('STEPPE_Scrapes');
    const latest = rows
      .filter((r) => !String(r.id).includes(':'))
      .sort((a, b) => String(b.checked_at).localeCompare(String(a.checked_at)))
      .find((r) =>
        JSON.parse(String(r.payload)).reports?.some(
          (s: { source: string }) => s.source === this.source,
        ),
      );
    if (!latest) return [];
    const header = JSON.parse(String(latest.payload)),
      status = header.reports.find((s: { source: string }) => s.source === this.source);
    if (
      Date.now() - Date.parse(String(latest.checked_at)) > 36 * 3600000 ||
      ['error', 'needs_permission', 'time_limit'].includes(status.status)
    )
      throw new IntegrationError('RETAIL_SCRAPE_UNAVAILABLE');
    const products = rows
      .filter((r) => String(r.id).startsWith(`${latest.id}:`))
      .flatMap((r) => {
        const raw = JSON.parse(String(r.payload));
        if (raw.source !== this.source) return [];
        const p = retailScrapeProduct(raw);
        return p ? [p] : [];
      });
    if (new Set(products.map((p) => p.id)).size !== products.length)
      throw new IntegrationError('DUPLICATE_RETAIL_SCRAPE');
    return products;
  }
}
