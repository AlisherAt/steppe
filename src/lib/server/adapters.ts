import { z } from 'zod';
import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import { fetchText, IntegrationError, publicHttps, splitHosts } from './http';
import type { Product, Rate } from '../types';
import { discountPercent, toKzt } from '../money';
import { normalizeBrand } from '../brands';
import { parseYml, parseCsvFeed, parseGoogleXml, type FeedFormat } from './feed-formats';
const amount = z.string().regex(/^\d{1,9}(\.\d{1,4})?$/);
export const feedProductSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    brand: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(180),
    productUrl: z.string().url().max(2000),
    imageUrl: z.string().url().max(2000).nullable().default(null),
    saleStartsAt: z.string().datetime({ offset: true }).optional(),
    saleEndsAt: z.string().datetime({ offset: true }).optional(),
    offerKind: z.enum(['market', 'retail']).optional(),
    purchaseType: z.literal('fixed').optional(),
    warehouseCountry: z.string().length(2).optional(),
    market: z.enum(['US', 'EU']).optional(),
    sku: z.string().max(160).optional(),
    sourceUpdatedAt: z.string().datetime({ offset: true }).optional(),
    originalPrice: amount.nullable(),
    salePrice: amount,
    currency: z.string().regex(/^[A-Z]{3}$/),
    sizePrices: z
      .array(z.object({ size: z.string().min(1).max(20), salePrice: amount }))
      .max(60)
      .optional(),
    sizes: z.array(z.string().trim().min(1).max(20)).max(60).default([]),
    gender: z.enum(['men', 'women', 'unisex', 'kids']).default('unisex'),
    category: z.string().trim().min(1).max(80).default('Кроссовки'),
    available: z.boolean().default(true),
    deliveryCountries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .max(250)
      .optional(),
    delivery: z
      .object({
        country: z.literal('KZ'),
        basis: z.enum(['merchant-feed', 'ebay-filter']),
        checkedAt: z.string().datetime({ offset: true }),
        policyUrl: z.string().url(),
      })
      .optional(),
  })
  .refine(
    (p) => {
      try {
        return (
          (!p.saleStartsAt ||
            !p.saleEndsAt ||
            Date.parse(p.saleStartsAt) < Date.parse(p.saleEndsAt)) &&
          new Decimal(p.salePrice).gt(0) &&
          (p.offerKind === 'market'
            ? p.market === 'US' &&
              p.currency === 'USD' &&
              p.originalPrice === null &&
              !!p.sourceUpdatedAt
            : p.offerKind === 'retail'
              ? p.purchaseType === 'fixed' &&
                !!p.warehouseCountry &&
                !!p.sizePrices?.length &&
                p.originalPrice === null &&
                p.sizes.length === p.sizePrices.length &&
                p.sizePrices.every((v) => p.sizes.includes(v.size) && Number(v.salePrice) > 0)
              : p.originalPrice !== null &&
                new Decimal(p.originalPrice).gt(0) &&
                new Decimal(p.salePrice).lte(p.originalPrice))
        );
      } catch {
        return false;
      }
    },
    { message: 'Некорректные цены' },
  );
export type FeedProduct = z.infer<typeof feedProductSchema>;
const feedSchema = z.object({
  version: z.literal(1),
  complete: z.literal(true),
  generatedAt: z.string().datetime({ offset: true }),
  products: z.array(feedProductSchema).max(1000),
});
export interface SourceAdapter {
  id: string;
  name: string;
  configured(): boolean;
  configurationMessage: string;
  fetchProducts(): Promise<FeedProduct[]>;
}
export function normalizeProductUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_|gclid$|fbclid$|affiliate$|aff_id$)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString().replace(/\/$/, '');
}
export function deduplicate(products: FeedProduct[]): FeedProduct[] {
  const byId = new Map<string, FeedProduct>();
  const byUrl = new Map<string, string>();
  for (const product of products) {
    const canonical = normalizeProductUrl(product.productUrl);
    const knownId = byId.has(product.id) ? product.id : byUrl.get(canonical);
    const existing = knownId ? byId.get(knownId) : undefined;
    if (existing) {
      // Conflicting variants/prices must be fixed by the publisher; never invent availability.
      if (
        existing.currency !== product.currency ||
        existing.salePrice !== product.salePrice ||
        existing.originalPrice !== product.originalPrice ||
        existing.name !== product.name ||
        normalizeProductUrl(existing.productUrl) !== canonical ||
        existing.saleStartsAt !== product.saleStartsAt ||
        existing.saleEndsAt !== product.saleEndsAt ||
        existing.available !== product.available
      )
        throw new IntegrationError('CONFLICTING_DUPLICATE');
      existing.sizes = [...new Set([...existing.sizes, ...product.sizes])];
    } else {
      byId.set(product.id, { ...product, sizes: [...new Set(product.sizes)] });
      byUrl.set(canonical, product.id);
    }
  }
  return [...byId.values()];
}
export class AuthorizedJsonAdapter implements SourceAdapter {
  constructor(
    public id: string,
    public name: string,
    protected prefix: string,
    public configurationMessage: string,
  ) {}
  configured() {
    return Boolean(
      process.env[`${this.prefix}_FEED_URL`] &&
      process.env[`${this.prefix}_FEED_HOSTS`] &&
      process.env[`${this.prefix}_FEED_PERMISSION`] &&
      process.env[`${this.prefix}_FEED_KZ_ONLY`] === 'true' &&
      process.env[`${this.prefix}_DELIVERY_POLICY_URL`] &&
      process.env[`${this.prefix}_FEED_FRESHNESS_CONFIRMED`] === 'true' &&
      process.env[`${this.prefix}_PRODUCT_HOSTS`],
    );
  }
  protected parse(text: string): unknown[] {
    let feed: z.infer<typeof feedSchema>;
    try {
      feed = feedSchema.parse(JSON.parse(text));
    } catch {
      throw new IntegrationError('INVALID_FEED');
    }
    const age = Date.now() - Date.parse(feed.generatedAt);
    if (age < -3600000 || age > 36 * 3600000) throw new IntegrationError('STALE_FEED');
    return feed.products;
  }
  async fetchProducts(): Promise<FeedProduct[]> {
    if (!this.configured()) throw new IntegrationError('SOURCE_NOT_CONFIGURED');
    const text = await fetchText(process.env[`${this.prefix}_FEED_URL`]!, {
      hosts: splitHosts(process.env[`${this.prefix}_FEED_HOSTS`]),
      token: process.env[`${this.prefix}_FEED_TOKEN`],
      maxBytes: 20_000_000,
    });
    const parsed = this.parse(text);
    const validation = z.array(feedProductSchema).max(1000).safeParse(parsed);
    if (!validation.success) throw new IntegrationError('INVALID_FEED_PRODUCTS');
    const products = validation.data.map((p) => ({ ...p, brand: normalizeBrand(p.brand) }));
    const policyUrl = publicHttps(
      process.env[`${this.prefix}_DELIVERY_POLICY_URL`]!,
      splitHosts(process.env[`${this.prefix}_PRODUCT_HOSTS`]),
    ).toString();
    const imageHosts = splitHosts(process.env.PRODUCT_IMAGE_HOSTS);
    for (const p of products) {
      publicHttps(p.productUrl, splitHosts(process.env[`${this.prefix}_PRODUCT_HOSTS`]));
      if (p.imageUrl) publicHttps(p.imageUrl, imageHosts);
    }
    return deduplicate(
      products
        .filter((p) => !p.deliveryCountries || p.deliveryCountries.includes('KZ'))
        .map((p) => ({
          ...p,
          delivery: {
            country: 'KZ' as const,
            basis: 'merchant-feed' as const,
            checkedAt: new Date().toISOString(),
            policyUrl,
          },
        })),
    ).filter(
      (p) =>
        p.available &&
        p.originalPrice !== null &&
        new Decimal(p.salePrice).lt(p.originalPrice) &&
        (!p.saleStartsAt || Date.parse(p.saleStartsAt) <= Date.now()) &&
        (!p.saleEndsAt || Date.parse(p.saleEndsAt) > Date.now()),
    );
  }
}
export class PartnerFeedAdapter extends AuthorizedJsonAdapter {
  constructor(
    id: string,
    name: string,
    prefix: string,
    message: string,
    private defaultFormat: FeedFormat = 'json',
  ) {
    super(id, name, prefix, message);
  }
  protected parse(text: string): unknown[] {
    const format = process.env[`${this.prefix}_FEED_FORMAT`] || this.defaultFormat;
    const options = {
      timezone: process.env[`${this.prefix}_FEED_TIMEZONE`],
      euSizes: process.env[`${this.prefix}_FEED_SIZES_EU`] === 'true',
      categoryPattern: process.env[`${this.prefix}_FEED_CATEGORY`],
      allowEmpty: process.env[`${this.prefix}_FEED_ALLOW_EMPTY`] === 'true',
    };
    if (format === 'json') return super.parse(text);
    if (format === 'yml') return parseYml(text, options);
    if (format === 'awin-csv' || format === 'google-csv')
      return parseCsvFeed(text, format, options);
    if (format === 'google-xml') return parseGoogleXml(text, options);
    throw new IntegrationError('UNKNOWN_FEED_FORMAT');
  }
}
export function toProduct(
  p: FeedProduct,
  adapter: Pick<SourceAdapter, 'id' | 'name'>,
  rates: Rate[],
  now = new Date(),
): Product {
  const rate = rates.find((r) => r.currency === p.currency);
  if (!rate) throw new IntegrationError('CURRENCY_RATE_MISSING');
  return {
    id: createHash('sha256').update(`${adapter.id}:${p.id}`).digest('hex'),
    externalId: p.id,
    sourceId: adapter.id,
    sourceName: adapter.name,
    brand: normalizeBrand(p.brand),
    name: p.name,
    imageUrl: p.imageUrl,
    productUrl: p.productUrl,
    sizes: p.sizes,
    ...(p.purchaseType
      ? { purchaseType: p.purchaseType, warehouseCountry: p.warehouseCountry }
      : {}),
    ...(p.sizePrices
      ? { sizePrices: p.sizePrices.map((v) => ({ ...v, saleKzt: toKzt(v.salePrice, rate.value) })) }
      : {}),
    gender: p.gender,
    category: p.category,
    originalPrice: p.originalPrice,
    salePrice: p.salePrice,
    currency: p.currency,
    originalKzt: p.originalPrice === null ? null : toKzt(p.originalPrice, rate.value),
    saleKzt: toKzt(p.salePrice, rate.value),
    discount: p.originalPrice === null ? 0 : discountPercent(p.originalPrice, p.salePrice),
    ...(p.offerKind
      ? { offerKind: p.offerKind, market: p.market, sku: p.sku, sourceUpdatedAt: p.sourceUpdatedAt }
      : {}),
    rate,
    ...(p.saleStartsAt ? { saleStartsAt: p.saleStartsAt } : {}),
    ...(p.saleEndsAt ? { saleEndsAt: p.saleEndsAt } : {}),
    updatedAt: now.toISOString(),
    firstSeenAt: now.toISOString(),
    demo: false,
    delivery: p.delivery,
  };
}
