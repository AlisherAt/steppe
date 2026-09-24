import { z } from 'zod';
import { feedProductSchema, type FeedProduct, type SourceAdapter } from './adapters';
import { fetchText, IntegrationError, publicHttps, splitHosts } from './http';
import { EUROPE_COUNTRIES } from '../orderable';
const amount = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,4})?$/)
  .refine((v) => Number(v) > 0);
const schema = z.object({
  version: z.literal(1),
  complete: z.literal(true),
  generatedAt: z.string().datetime({ offset: true }),
  products: z
    .array(
      z.object({
        id: z.string().min(1).max(160),
        name: z.string().min(1).max(180),
        brand: z.string().min(1).max(80),
        sku: z.string().max(160).optional(),
        productUrl: z.string().url(),
        imageUrl: z.string().url().nullable(),
        purchaseType: z.literal('fixed'),
        warehouseCountry: z.string().length(2),
        currency: z.enum([
          'USD',
          'EUR',
          'GBP',
          'CHF',
          'SEK',
          'NOK',
          'DKK',
          'PLN',
          'CZK',
          'HUF',
          'RON',
          'ISK',
          'BGN',
        ]),
        gender: z.enum(['men', 'women', 'kids', 'unisex']).default('unisex'),
        variants: z
          .array(
            z.object({
              id: z.string().min(1).max(160),
              sizeEU: z.string().regex(/^\d+(?:\.\d+)?$/),
              price: amount,
              stock: z.number().int().nonnegative(),
              checkedAt: z.string().datetime({ offset: true }),
            }),
          )
          .min(1)
          .max(60),
      }),
    )
    .max(1000),
});
export function parseFixedRetail(
  value: unknown,
  region: 'US' | 'EU',
  now = Date.now(),
): FeedProduct[] {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new IntegrationError('INVALID_FIXED_RETAIL_FEED');
  const fresh = (date: string) =>
    Date.parse(date) <= now + 3600000 && now - Date.parse(date) <= 36 * 3600000;
  if (!fresh(parsed.data.generatedAt)) throw new IntegrationError('STALE_FEED');
  const ids = new Set<string>();
  return parsed.data.products.flatMap((p) => {
    if (ids.has(p.id)) throw new IntegrationError('DUPLICATE_FIXED_PRODUCT');
    ids.add(p.id);
    if (
      !(region === 'US'
        ? p.warehouseCountry === 'US'
        : EUROPE_COUNTRIES.includes(p.warehouseCountry))
    )
      return [];
    const variants = p.variants.filter((v) => v.stock > 0 && fresh(v.checkedAt));
    if (!variants.length) return [];
    if (
      new Set(p.variants.map((v) => v.sizeEU)).size !== p.variants.length ||
      new Set(p.variants.map((v) => v.id)).size !== p.variants.length
    )
      throw new IntegrationError('AMBIGUOUS_FIXED_VARIANTS');
    const cheapest = variants.reduce((a, b) => (Number(a.price) <= Number(b.price) ? a : b));
    return [
      feedProductSchema.parse({
        id: p.id,
        name: p.name,
        brand: p.brand,
        sku: p.sku,
        productUrl: p.productUrl,
        imageUrl: p.imageUrl,
        currency: p.currency,
        offerKind: 'retail',
        purchaseType: 'fixed',
        warehouseCountry: p.warehouseCountry,
        market: region,
        originalPrice: null,
        salePrice: cheapest.price,
        sizes: variants.map((v) => v.sizeEU),
        sizePrices: variants.map((v) => ({ size: v.sizeEU, salePrice: v.price })),
        gender: p.gender,
        category: 'Кроссовки',
        available: true,
        sourceUpdatedAt: new Date(
          Math.min(...variants.map((v) => Date.parse(v.checkedAt))),
        ).toISOString(),
      }),
    ];
  });
}
export class FixedRetailAdapter implements SourceAdapter {
  constructor(
    public id: string,
    public name: string,
    private prefix: string,
    private region: 'US' | 'EU',
  ) {}
  configurationMessage =
    'Нужен разрешённый фид поставщика с ценой, остатком каждого размера и страной отгрузки. Розничные ставки не используются.';
  configured() {
    return Boolean(
      process.env[`${this.prefix}_FEED_URL`] &&
      process.env[`${this.prefix}_FEED_HOSTS`] &&
      process.env[`${this.prefix}_PRODUCT_HOSTS`] &&
      process.env[`${this.prefix}_RESELLER_PERMISSION`],
    );
  }
  async fetchProducts() {
    if (!this.configured()) throw new IntegrationError('FIXED_RETAIL_NOT_CONFIGURED');
    const text = await fetchText(process.env[`${this.prefix}_FEED_URL`]!, {
      hosts: splitHosts(process.env[`${this.prefix}_FEED_HOSTS`]),
      token: process.env[`${this.prefix}_FEED_TOKEN`],
      maxBytes: 20_000_000,
    });
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new IntegrationError('INVALID_FIXED_RETAIL_FEED');
    }
    const products = parseFixedRetail(data, this.region);
    for (const p of products) {
      publicHttps(p.productUrl, splitHosts(process.env[`${this.prefix}_PRODUCT_HOSTS`]));
      if (p.imageUrl) publicHttps(p.imageUrl, splitHosts(process.env.PRODUCT_IMAGE_HOSTS));
    }
    return products;
  }
}
