import { z } from 'zod';
import { fetchText, IntegrationError } from './http';

const iso = z.string().datetime({ offset: true });
const variant = z.object({
  id: z.string().min(1),
  size: z.string(),
  size_type: z.string(),
  sizes: z.array(z.object({ size: z.string(), type: z.string() })).default([]),
  lowest_ask: z.number().finite().nonnegative().nullable().optional(),
  total_asks: z.number().int().nonnegative().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  market: z.string(),
  updated_at: iso,
  hidden: z.boolean().optional(),
});
const product = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  brand: z.string().min(1),
  sku: z.string(),
  product_type: z.string(),
  image: z.string().url().nullable().optional(),
  link: z.string().url(),
  updated_at: iso,
  variants: z.array(variant),
});
const responseSchema = z.object({ data: z.array(product).max(100) });
export type KicksProduct = z.infer<typeof product>;

/** Market observations, NOT confirmed discount offers or proof of delivery to KZ. */
export function parseKicksProducts(value: unknown): KicksProduct[] {
  const result = responseSchema.safeParse(value);
  if (!result.success) throw new IntegrationError('INVALID_KICKS_RESPONSE');
  for (const p of result.data.data) {
    const url = new URL(p.link);
    const stockx = (u: URL) =>
      u.protocol === 'https:' &&
      ['stockx.com', 'www.stockx.com'].includes(u.hostname) &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === '443');
    let allowed = stockx(url);
    // KicksDB may return its affiliate link. Validate its encoded destination without following it.
    if (
      url.protocol === 'https:' &&
      url.hostname === 'stockx.pvxt.net' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443')
    ) {
      try {
        allowed = stockx(new URL(url.searchParams.get('u') || ''));
      } catch {
        allowed = false;
      }
    }
    if (!allowed) throw new IntegrationError('INVALID_KICKS_PRODUCT_URL');
  }
  return result.data.data;
}
export async function searchKicksProducts(query: string, limit = 20): Promise<KicksProduct[]> {
  if (!process.env.KICKS_API_KEY) throw new IntegrationError('KICKS_KEY_MISSING');
  if (!query.trim() || query.length > 100 || !Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new IntegrationError('INVALID_KICKS_QUERY');
  const url = new URL('https://api.kicks.dev/v3/stockx/products');
  url.search = new URLSearchParams({
    query: query.trim(),
    limit: String(limit),
    market: 'US',
    'display[variants]': 'true',
    'display[prices]': 'true',
  }).toString();
  const text = await fetchText(url.toString(), {
    hosts: ['api.kicks.dev'],
    token: process.env.KICKS_API_KEY,
    attempts: 1,
    maxBytes: 10_000_000,
  });
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new IntegrationError('INVALID_KICKS_RESPONSE');
  }
  return parseKicksProducts(payload);
}
