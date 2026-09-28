import { z } from 'zod';
import { uniqloName } from '../uniqlo-labels.mjs';
import { feedProductSchema, toProduct } from './adapters';
import { manualProductSchema } from './manual-products';
import { publicHttps } from './http';
import type { Product, Rate } from '../types';
import { clothingSources, clothingCategory } from '../../../scripts/clothing/products.mjs';
const amount = z
  .string()
  .regex(/^\d{1,8}(?:\.\d{1,4})?$/)
  .refine((v) => Number(v) > 0);
export const clothingRawSchema = z.object({
  source: z.string(),
  brand: z.string(),
  sku: z.string().min(1).max(160),
  name: z.string().min(1).max(180),
  image_url: z.string().url(),
  image_urls: z.array(z.string().url()).max(10).optional(),
  color: z.string().max(300).optional(),
  usage: z.string().max(500).optional(),
  product_url: z.string().url(),
  currency: z.enum(['USD', 'JPY', 'KRW']),
  gender: z.enum(['men', 'women', 'kids', 'unisex']).default('unisex'),
  discount_verified: z.boolean().optional(),
  sale_starts_at: z.string().datetime({ offset: true }).optional(),
  sale_ends_at: z.string().datetime({ offset: true }).optional(),
  checked_at: z.string().datetime({ offset: true }),
  category: z.string().max(80).optional(),
  variants: z
    .array(
      z.object({
        id: z.string().min(1),
        size: z.string().trim().min(1).max(20),
        salePrice: amount,
        originalPrice: amount.nullable(),
        discountEvidence: z.enum(['discount', 'limitedOffer']).optional(),
        available: z.literal(true),
        checkedAt: z.string().datetime({ offset: true }),
      }),
    )
    .min(1)
    .max(60),
});
export type ClothingSource = keyof typeof clothingSources;
export function clothingProduct(
  input: unknown,
  key: ClothingSource,
  rates: Rate[],
  now = Date.now(),
): Product {
  const p = clothingRawSchema.parse(input),
    s = clothingSources[key];
  if (p.source !== key || p.brand !== s.brand || p.currency !== s.currency)
    throw Error('CLOTHING_SOURCE_MISMATCH');
  const url = publicHttps(p.product_url, [new URL(s.url).hostname]);
  const prefix =
    key === 'uniqlo-jp'
      ? '/jp/ja/products/'
      : key === 'uniqlo-kr'
        ? '/kr/ko/products/'
        : key === 'nike'
          ? '/t/'
          : key === 'puma'
            ? '/us/en/pd/'
            : '/products/';
  if (!url.pathname.startsWith(prefix)) throw Error('CLOTHING_PRODUCT_REGION');
  const imageHosts =
    key === 'nike'
      ? ['static.nike.com']
      : key === 'puma'
        ? ['images.puma.com']
        : key === 'reebok'
          ? ['www.reebok.com', 'cdn.shopify.com']
          : ['image.uniqlo.com'];
  for (const image of [p.image_url, ...(p.image_urls || [])]) publicHttps(image, imageHosts);
  const fresh = (d: string) =>
    Number.isFinite(Date.parse(d)) &&
    Date.parse(d) <= now + 60000 &&
    now - Date.parse(d) <= 36 * 3600000;
  if (!fresh(p.checked_at) || p.variants.some((v) => !fresh(v.checkedAt)))
    throw Error('STALE_CLOTHING_PRODUCT');
  const uniqlo = key.startsWith('uniqlo-');
  if (uniqlo) {
    const length = p.sku.match(/-\d{2}-\d{2}-(.+)$/)?.[1];
    const label = uniqloName(p.usage || '', '', length === 'standard' ? '' : length, p.sku);
    if (!label.allowed) throw Error('UNIQLO_NOT_RECOGNIZED_CLOTHING');
    p.name = label.name;
    p.category = label.category;
  }
  if (
    p.variants.some(
      (v) => v.originalPrice !== null && Number(v.salePrice) >= Number(v.originalPrice),
    )
  )
    throw Error('CLOTHING_INVALID_OLD_PRICE');
  if (!uniqlo && p.variants.some((v) => v.originalPrice === null))
    throw Error('CLOTHING_NOT_DISCOUNTED');
  const verified = p.variants.every(
    (v) => v.originalPrice !== null || Boolean(p.discount_verified && v.discountEvidence),
  );
  if (p.discount_verified && !verified) throw Error('CLOTHING_DISCOUNT_EVIDENCE_REQUIRED');
  if (
    new Set(p.variants.map((v) => v.size)).size !== p.variants.length ||
    new Set(p.variants.map((v) => v.id)).size !== p.variants.length
  )
    throw Error('CLOTHING_DUPLICATE_VARIANT');
  const cheapest = p.variants.reduce((a, b) =>
    Number(a.salePrice) <= Number(b.salePrice) ? a : b,
  );
  const feed = feedProductSchema.parse({
    id: p.sku,
    sku: p.sku,
    brand: p.brand,
    name: p.name,
    productUrl: p.product_url,
    imageUrl: p.image_url,
    imageUrls: p.image_urls,
    color: p.color,
    usage: p.usage,
    department: s.department,
    discountVerified: verified,
    saleStartsAt: p.sale_starts_at,
    saleEndsAt: p.sale_ends_at,
    market: s.market,
    currency: s.currency,
    offerKind: 'retail',
    purchaseType: 'fixed',
    originalPrice:
      new Set(p.variants.map((v) => v.originalPrice)).size === 1 ? cheapest.originalPrice : null,
    salePrice: cheapest.salePrice,
    sizes: p.variants.map((v) => v.size),
    sizePrices: p.variants.map((v) => ({ size: v.size, salePrice: v.salePrice })),
    gender: p.gender,
    category: p.category || clothingCategory(p.name),
    sourceUpdatedAt: new Date(
      Math.min(Date.parse(p.checked_at), ...p.variants.map((v) => Date.parse(v.checkedAt))),
    ).toISOString(),
  });
  const result = toProduct(
    feed,
    { id: s.id, name: `${s.brand} ${s.market}` },
    rates,
    new Date(now),
  );
  result.updatedAt = result.sourceUpdatedAt!;
  result.firstSeenAt = result.updatedAt;
  return manualProductSchema.parse(result);
}
