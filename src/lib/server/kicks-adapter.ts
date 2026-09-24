import { searchKicksProducts, type KicksProduct } from './kicks';
import { feedProductSchema, type FeedProduct, type SourceAdapter } from './adapters';
import { IntegrationError, publicHttps } from './http';

export const KICKS_BRANDS = [
  'Nike',
  'adidas',
  'New Balance',
  'ASICS',
  'Jordan',
  'Puma',
  'Reebok',
  'Converse',
];
export function kicksOffers(products: KicksProduct[], now = Date.now()): FeedProduct[] {
  return products.flatMap((p) => {
    if (p.product_type.toLowerCase() !== 'sneakers') return [];
    const valid = p.variants.filter(
      (v) =>
        v.market === 'US' &&
        v.currency === 'USD' &&
        !v.hidden &&
        (v.total_asks || 0) > 0 &&
        (v.lowest_ask || 0) > 0 &&
        now - Date.parse(v.updated_at) <= 36 * 3600000 &&
        Date.parse(v.updated_at) <= now + 3600000 &&
        v.sizes.some(
          (s) =>
            s.type.toLowerCase() === 'eu' && /^\d+(?:\.\d+)?$/.test(s.size.replace(/^EU\s*/i, '')),
        ),
    );
    if (!valid.length) return [];
    const lowest = Math.min(...valid.map((v) => v.lowest_ask!));
    const bySize = new Map<string, number>();
    for (const v of valid)
      for (const s of v.sizes) {
        const size = s.size.replace(/^EU\s*/i, '');
        if (s.type.toLowerCase() !== 'eu' || !/^\d+(?:\.\d+)?$/.test(size)) continue;
        bySize.set(size, Math.min(bySize.get(size) ?? Infinity, v.lowest_ask!));
      }
    const sizes = [...bySize.keys()].sort((a, b) => Number(a) - Number(b));
    const sizePrices = sizes.map((size) => ({ size, salePrice: String(bySize.get(size)) }));
    let imageUrl: string | null = null;
    if (p.image) {
      try {
        const image = publicHttps(p.image, ['images.stockx.com']);
        image.searchParams.set('w', '700');
        image.searchParams.set('h', '500');
        imageUrl = image.toString();
      } catch {
        /* Missing approved image must not invalidate an otherwise valid offer. */
      }
    }
    return [
      feedProductSchema.parse({
        id: p.id,
        name: p.title,
        brand: p.brand,
        sku: p.sku,
        productUrl: p.link,
        imageUrl,
        sizes,
        sizePrices,
        gender: ['men', 'women', 'kids'].includes(p.gender || '') ? p.gender : 'unisex',
        category: 'Кроссовки',
        available: true,
        offerKind: 'market',
        market: 'US',
        currency: 'USD',
        originalPrice: null,
        salePrice: String(lowest),
        sourceUpdatedAt: new Date(
          Math.min(...valid.map((v) => Date.parse(v.updated_at))),
        ).toISOString(),
      }),
    ];
  });
}
export class KicksAdapter implements SourceAdapter {
  id = 'kicks-stockx';
  name = 'StockX · США';
  configurationMessage = 'Нужен серверный ключ KICKS_API_KEY. Цены рынка США через KicksDB.';
  configured() {
    return Boolean(process.env.KICKS_API_KEY);
  }
  async fetchProducts(): Promise<FeedProduct[]> {
    if (!this.configured()) throw new IntegrationError('KICKS_KEY_MISSING');
    // Eight bounded calls per scheduled refresh, 496 in a 31-day month. No detail calls per shoe.
    const products = new Map<string, KicksProduct>();
    for (const brand of KICKS_BRANDS) {
      for (const p of await searchKicksProducts(brand, 8)) products.set(p.id, p);
    }
    // A failed request rejects the entire snapshot; previous data remains until its TTL expires.
    return kicksOffers([...products.values()]);
  }
}
