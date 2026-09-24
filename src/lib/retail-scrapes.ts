import { z } from 'zod';
import { officialStores, retailStoreId } from './official-stores';
const amount = z
  .string()
  .regex(/^\d{1,7}\.\d{2}$/)
  .refine((v) => Number(v) > 0);
export const retailVariantSchema = z
  .object({
    id: z.string().min(1).max(100),
    size: z.string().min(1).max(20),
    salePrice: amount,
    originalPrice: amount,
    available: z.literal(true),
    checkedAt: z.string().datetime({ offset: true }),
  })
  .refine((v) => Number(v.salePrice) < Number(v.originalPrice));
export const retailScrapeSchema = z
  .object({
    source: z.enum(['reebok', 'on', 'brooks', 'skechers', 'fila']),
    brand: z.string(),
    sku: z.string().min(1).max(160),
    name: z.string().min(1).max(180),
    product_url: z.string().url(),
    image_url: z.string().url(),
    currency: z.enum(['USD', 'EUR']),
    gender: z.enum(['men', 'women', 'kids', 'unisex']),
    size_price_verified: z.literal(true),
    checked_at: z.string().datetime({ offset: true }),
    variants: z.array(retailVariantSchema).min(1).max(60),
  })
  .superRefine((p, ctx) => {
    const s = officialStores[retailStoreId(p.source)],
      url = new URL(p.product_url),
      img = new URL(p.image_url);
    const images = [
      s.origin,
      ...(p.source === 'reebok'
        ? ['https://cdn.shopify.com']
        : p.source === 'on'
          ? ['https://images.ctfassets.net']
          : p.source === 'skechers'
            ? ['https://images.skechers.com']
            : []),
    ];
    if (
      url.origin !== s.origin ||
      p.brand !== s.brand ||
      p.currency !== (p.source === 'fila' ? 'EUR' : 'USD') ||
      url.username ||
      url.password ||
      img.username ||
      img.password ||
      !images.includes(img.origin)
    )
      ctx.addIssue({ code: 'custom', message: 'RETAIL_ORIGIN_MISMATCH' });
    if (
      p.source === 'on' &&
      (!url.pathname.startsWith('/en-us/products/') || !url.pathname.endsWith(p.sku))
    )
      ctx.addIssue({ code: 'custom', message: 'RETAIL_SKU_MISMATCH' });
    if (
      p.variants.some(
        (v) =>
          !(
            p.source === 'fila' ? /^EU \d+(?:\.\d+)?$/ : /^US [MWK]? ?\d+(?:\.\d+)?(?: [A-Z0-9]+)?$/
          ).test(v.size),
      )
    )
      ctx.addIssue({ code: 'custom', message: 'SIZE_SYSTEM_MISSING' });
    for (const key of ['id', 'size'] as const)
      if (new Set(p.variants.map((v) => v[key])).size !== p.variants.length)
        ctx.addIssue({ code: 'custom', message: 'DUPLICATE_VARIANT' });
  });
