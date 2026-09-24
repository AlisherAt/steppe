import { z } from 'zod';
const amount = z
  .string()
  .regex(/^\d{1,7}\.\d{2}$/)
  .refine((v) => Number(v) > 0);
export const pumaVariantSchema = z
  .object({
    id: z.string().regex(/^\d{1,8}$/),
    sizeUS: z.string().regex(/^\d+(\.\d+)?$/),
    sizeEU: z.string().regex(/^\d+(\.\d+)?$/),
    salePrice: amount,
    originalPrice: amount,
    available: z.literal(true),
    checkedAt: z.string().datetime({ offset: true }),
  })
  .refine((v) => Number(v.salePrice) < Number(v.originalPrice));
export const pumaVerifiedSchema = z
  .object({
    source: z.literal('puma'),
    brand: z.literal('Puma'),
    sku: z.string().regex(/^\d{6}_\d{2}$/),
    name: z.string().min(1).max(180),
    product_url: z.string().url(),
    image_url: z.string().url(),
    currency: z.literal('USD'),
    gender: z.enum(['men', 'women', 'kids', 'unisex']),
    size_price_verified: z.literal(true),
    checked_at: z.string().datetime({ offset: true }),
    variants: z.array(pumaVariantSchema).min(1).max(60),
  })
  .superRefine((p, ctx) => {
    const u = new URL(p.product_url),
      img = new URL(p.image_url);
    if (
      u.origin !== 'https://us.puma.com' ||
      u.username ||
      u.password ||
      !u.pathname.startsWith('/us/en/pd/') ||
      u.pathname.split('/').pop() !== p.sku.split('_')[0] ||
      u.searchParams.get('swatch') !== p.sku.split('_')[1] ||
      img.origin !== 'https://images.puma.com' ||
      img.username ||
      img.password
    )
      ctx.addIssue({ code: 'custom', message: 'PUMA_URL_MISMATCH' });
    for (const key of ['id', 'sizeUS', 'sizeEU'] as const)
      if (new Set(p.variants.map((v) => v[key])).size !== p.variants.length)
        ctx.addIssue({ code: 'custom', message: 'PUMA_DUPLICATE_SIZE' });
  });
