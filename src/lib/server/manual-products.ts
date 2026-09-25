import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Product } from '../types';
import { canonicalProductUrl, manualSource, productImageHosts } from '../manual-source';
import { withSellingPrices } from '../selling-price';
import { offerVisible } from '../promotion';
import { seaClient, type SeaTransport, type SeaRow } from './seatable-client';
import { publicHttps, splitHosts } from './http';
import { AuthError } from './auth';

export const urlKey = (url: string) =>
  createHash('sha256').update(canonicalProductUrl(url)).digest('hex');
const money = z.number().int().positive().max(100_000_000);
export const manualProductSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  externalId: z.string().min(1),
  sourceId: z.string(),
  sourceName: z.string(),
  brand: z.string().min(1).max(80),
  name: z.string().min(1).max(180),
  productUrl: z.string().url(),
  imageUrl: z.string().url().nullable(),
  sizes: z.array(z.string().max(20)).min(1).max(60),
  sizePrices: z
    .array(
      z.object({
        size: z.string().max(20),
        salePrice: z.string().regex(/^\d+(\.\d+)?$/),
        saleKzt: money,
      }),
    )
    .min(1)
    .max(60),
  gender: z.enum(['men', 'women', 'kids', 'unisex']),
  category: z.string(),
  offerKind: z.literal('retail'),
  purchaseType: z.literal('fixed'),
  market: z.enum(['US', 'EU']),
  sku: z.string().max(160).optional(),
  sourceUpdatedAt: z.string().datetime(),
  saleStartsAt: z.string().datetime().optional(),
  saleEndsAt: z.string().datetime().optional(),
  originalPrice: z.string().nullable(),
  salePrice: z.string(),
  currency: z.string(),
  originalKzt: money.nullable(),
  saleKzt: money,
  discount: z.number().min(0).max(100),
  updatedAt: z.string().datetime(),
  firstSeenAt: z.string().datetime(),
  demo: z.literal(false),
  rate: z.object({
    currency: z.string(),
    value: z.string(),
    source: z.string(),
    asOf: z.string(),
    fetchedAt: z.string(),
  }),
});
export const publishSchema = z.object({
  draftId: z.string().uuid(),
  name: z.string().trim().min(1).max(180),
  brand: z.string().trim().min(1).max(80),
  gender: z.enum(['men', 'women', 'kids', 'unisex']),
  selections: z
    .array(
      z.object({ index: z.number().int().min(0).max(59), size: z.string().trim().min(1).max(20) }),
    )
    .min(1)
    .max(60),
  confirmed: z.literal(true),
});
type RecordData = { row: SeaRow; product: Product };

export class ManualProducts {
  constructor(private db: SeaTransport = seaClient) {}
  async records(): Promise<RecordData[]> {
    const rows = await this.db.rows('STEPPE_ManualProducts');
    return rows.flatMap((row) => {
      try {
        const product = manualProductSchema.parse(JSON.parse(String(row.payload)));
        return [{ row, product }];
      } catch {
        return [];
      }
    });
  }
  async createDraft(product: Product, owner: string) {
    const parsed = manualProductSchema.parse(product);
    manualSource(parsed.productUrl);
    if (parsed.imageUrl)
      publicHttps(parsed.imageUrl, [
        ...productImageHosts,
        ...splitHosts(process.env.PRODUCT_IMAGE_HOSTS),
      ]);
    const id = randomUUID();
    await this.db.append('STEPPE_ManualProducts', [
      {
        id,
        product_id: product.id,
        owner_id: owner,
        status: 'draft',
        updated_at: new Date().toISOString(),
        payload: JSON.stringify(parsed),
      },
    ]);
    return { draftId: id, product: parsed, selling: withSellingPrices(parsed) };
  }
  async publish(input: z.infer<typeof publishSchema>) {
    input = publishSchema.parse(input);
    const entry = (await this.records()).find(
      (r) => r.row.id === input.draftId && r.row.status === 'draft',
    );
    if (!entry) throw new AuthError(404, 'Черновик не найден или уже опубликован.');
    const original = entry.product;
    if (!offerVisible(original))
      throw new AuthError(409, 'Цена устарела. Получите её по ссылке ещё раз.');
    const seen = new Set<string>();
    const variants = input.selections.map((s) => {
      const value = original.sizePrices![s.index];
      if (!value || (value.size && value.size !== s.size) || seen.has(s.size.toUpperCase()))
        throw new AuthError(400, 'Проверьте выбранные размеры.');
      if (!value.size && !/^(EU|US)\s+(?:[MWK]\s+)?\d+(?:\.\d+)?(?:\s+[a-z0-9]+)?$/i.test(s.size))
        throw new AuthError(400, 'Укажите систему размера: например, EU 42 или US M 9.');
      seen.add(s.size.toUpperCase());
      return { ...value, size: s.size };
    });
    const cheapest = variants.reduce((a, b) => (a.saleKzt <= b.saleKzt ? a : b));
    const product: Product = {
      ...original,
      name: input.name,
      brand: input.brand,
      gender: input.gender,
      sizes: variants.map((v) => v.size),
      sizePrices: variants,
      salePrice: cheapest.salePrice,
      saleKzt: cheapest.saleKzt,
      updatedAt: new Date().toISOString(),
    };
    await this.db.update('STEPPE_ManualProducts', entry.row._id, {
      status: 'published',
      updated_at: product.updatedAt,
      payload: JSON.stringify(manualProductSchema.parse(product)),
    });
    await this.restore(product.id, product.productUrl);
    return product;
  }
  async discard(id: string) {
    const entry = (await this.records()).find((r) => r.row.id === id && r.row.status === 'draft');
    if (!entry) throw new AuthError(404, 'Черновик не найден.');
    await this.db.update('STEPPE_ManualProducts', entry.row._id, { status: 'discarded' });
  }
  async hide(product: Product, owner: string) {
    const hidden = await this.db.rows('STEPPE_HiddenProducts');
    if (!hidden.some((r) => r.id === product.id))
      await this.db.append('STEPPE_HiddenProducts', [
        {
          id: product.id,
          url_key: urlKey(product.productUrl),
          owner_id: owner,
          created_at: new Date().toISOString(),
        },
      ]);
  }
  async restore(id: string, url?: string) {
    const rows = (await this.db.rows('STEPPE_HiddenProducts')).filter(
      (r) => r.id === id || (url && r.url_key === urlKey(url)),
    );
    if (rows.length)
      await this.db.remove(
        'STEPPE_HiddenProducts',
        rows.map((r) => r._id),
      );
  }
  async combine(automatic: Product[], includeHidden = false) {
    const [records, hidden] = await Promise.all([
      this.records(),
      this.db.rows('STEPPE_HiddenProducts'),
    ]);
    const manual = records
      .filter((r) => r.row.status === 'published')
      .sort(
        (a, b) =>
          String(b.row.updated_at).localeCompare(String(a.row.updated_at)) ||
          String(a.row.id).localeCompare(String(b.row.id)),
      );
    const freshByUrl = new Map(automatic.map((p) => [urlKey(p.productUrl), p]));
    const refreshed = manual.map(({ product: p }) => {
      const latest = freshByUrl.get(urlKey(p.productUrl));
      if (
        !latest ||
        Date.parse(latest.sourceUpdatedAt || latest.updatedAt) <=
          Date.parse(p.sourceUpdatedAt || p.updatedAt)
      )
        return p;
      // Сборщик обновляет закупку и наличие, сохраняя выбранные администратором размеры.
      const sizePrices = latest.sizePrices?.filter((v) => p.sizes.includes(v.size)) || [];
      const cheapest = sizePrices.reduce<(typeof sizePrices)[number] | undefined>(
        (a, b) => (!a || b.saleKzt < a.saleKzt ? b : a),
        undefined,
      );
      return {
        ...latest,
        id: p.id,
        name: p.name,
        brand: p.brand,
        gender: p.gender,
        sizePrices,
        sizes: sizePrices.map((v) => v.size),
        salePrice: cheapest?.salePrice || latest.salePrice,
        saleKzt: cheapest?.saleKzt || latest.saleKzt,
      };
    });
    const seen = new Set<string>();
    const products = [...refreshed, ...automatic].filter((p) => {
      const key = urlKey(p.productUrl);
      if (seen.has(key)) return false;
      seen.add(key);
      return (
        includeHidden ||
        (offerVisible(p) && !hidden.some((r) => r.id === p.id || r.url_key === key))
      );
    });
    return { products, records, hidden };
  }
}
export const manualProducts = new ManualProducts();
