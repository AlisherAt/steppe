import { describe, expect, it } from 'vitest';
import { ManualProducts, publishSchema, urlKey } from '../src/lib/server/manual-products';
import { sellingPrice, withSellingPrices } from '../src/lib/selling-price';
import { extractLinkQuote } from '../src/lib/server/link-import';
import { manualSource, canonicalProductUrl } from '../src/lib/manual-source';
import { demoProducts } from '../src/lib/demo';
import { addToCart } from '../src/lib/cart';
import { whatsappOrder } from '../src/lib/whatsapp';
import type { Product } from '../src/lib/types';
import type { SeaTransport, SeaRow } from '../src/lib/server/seatable-client';

class Memory implements SeaTransport {
  data: Record<string, SeaRow[]> = {};
  async rows(table: string) {
    return (this.data[table] ||= []);
  }
  async append(table: string, rows: Record<string, unknown>[]) {
    (await this.rows(table)).push(...rows.map((r) => ({ ...r, _id: crypto.randomUUID() })));
  }
  async update(table: string, id: string, patch: Record<string, unknown>) {
    Object.assign(
      (await this.rows(table)).find((r) => r._id === id)!,
      patch,
    );
  }
  async remove(table: string, ids: string[]) {
    this.data[table] = (await this.rows(table)).filter((r) => !ids.includes(r._id));
  }
}
function product(): Product {
  const url = 'https://www.fila.de/test-sneaker';
  const at = new Date().toISOString();
  return {
    ...demoProducts[0],
    id: urlKey(url),
    externalId: 'TEST',
    productUrl: url,
    imageUrl: null,
    demo: false,
    market: 'EU',
    sourceId: 'manual-eu',
    offerKind: 'retail',
    purchaseType: 'fixed',
    currency: 'EUR',
    originalPrice: '70',
    originalKzt: 35000,
    salePrice: '30',
    saleKzt: 15000,
    sizes: ['EU 41', 'EU 42'],
    sizePrices: [
      { size: 'EU 41', salePrice: '30', saleKzt: 15000 },
      { size: 'EU 42', salePrice: '50', saleKzt: 25000 },
    ],
    sourceUpdatedAt: at,
    updatedAt: at,
    firstSeenAt: at,
  };
}
const input = (draftId: string) => ({
  draftId,
  name: 'Моя модель',
  brand: 'FILA',
  gender: 'unisex' as const,
  selections: [{ index: 1, size: 'EU 42' }],
  confirmed: true as const,
});

describe('selling prices', () => {
  it('applies the threshold and rounds whole tenge', () => {
    expect([15000, 19999, 20000, 25000, 20004, 20005].map(sellingPrice)).toEqual([
      18000, 22999, 22400, 28000, 22404, 22406,
    ]);
    for (const cost of [0, -1, NaN, Infinity, 15.2, Number.MAX_SAFE_INTEGER])
      expect(() => sellingPrice(cost)).toThrow();
  });
  it('keeps source costs, prices each size, and uses the same amount in cart and WhatsApp', () => {
    const raw = product(),
      priced = withSellingPrices(raw);
    expect(priced.saleKzt).toBe(18000);
    expect(priced.sizePrices![1].saleKzt).toBe(28000);
    expect(raw.sizePrices![1].saleKzt).toBe(25000);
    expect(priced.sizePrices![1].salePrice).toBe('50');
    expect(addToCart([], priced, 'EU 42')[0].saleKzt).toBe(28000);
    const text = new URL(
      whatsappOrder('77001234567', [{ id: priced.id, size: 'EU 42' }], [priced]),
    ).searchParams.get('text')!;
    expect(text.replace(/\s/g, '')).toContain('28000');
    expect(text).not.toContain(raw.productUrl);
    expect(
      withSellingPrices({ ...raw, originalKzt: 19000, saleKzt: 19999, sizePrices: undefined })
        .discount,
    ).toBe(0);
  });
});
describe('manual publication and deletion', () => {
  it('keeps drafts private and publishes selected sizes at server costs', async () => {
    const store = new ManualProducts(new Memory());
    const draft = await store.createDraft(product(), 'owner');
    expect((await store.combine([])).products).toHaveLength(0);
    const published = await store.publish(
      publishSchema.parse({ ...input(draft.draftId), saleKzt: 1 }),
    );
    expect(published.saleKzt).toBe(25000);
    expect(published.sizes).toEqual(['EU 42']);
    expect((await store.combine([])).products).toHaveLength(1);
    await expect(store.publish(input(draft.draftId))).rejects.toMatchObject({ status: 404 });
  });
  it('requires confirmation, rejects altered known sizes and stale drafts', async () => {
    const store = new ManualProducts(new Memory());
    const draft = await store.createDraft(product(), 'owner');
    expect(publishSchema.safeParse({ ...input(draft.draftId), confirmed: false }).success).toBe(
      false,
    );
    await expect(
      store.publish({ ...input(draft.draftId), selections: [{ index: 1, size: 'EU 45' }] }),
    ).rejects.toMatchObject({ status: 400 });
    const old = await store.createDraft(
      { ...product(), sourceUpdatedAt: new Date(0).toISOString() },
      'owner',
    );
    await expect(store.publish(input(old.draftId))).rejects.toMatchObject({ status: 409 });
  });
  it('retains deletion across fresh collector snapshots and restores explicitly', async () => {
    const db = new Memory(),
      store = new ManualProducts(db),
      p = product();
    await store.hide(p, 'owner');
    const refreshed = { ...p, id: 'b'.repeat(64), productUrl: p.productUrl + '?utm_source=test' };
    expect((await new ManualProducts(db).combine([refreshed])).products).toHaveLength(0);
    expect((await store.combine([refreshed], true)).products).toHaveLength(1);
    await store.restore(refreshed.id, refreshed.productUrl);
    expect((await store.combine([refreshed])).products).toHaveLength(1);
  });
  it('deduplicates tracking links and lets manual metadata override the collector', async () => {
    const store = new ManualProducts(new Memory()),
      p = product();
    const d = await store.createDraft(p, 'owner');
    await store.publish(input(d.draftId));
    const merged = await store.combine([{ ...p, productUrl: p.productUrl + '?utm_source=test' }]);
    expect(merged.products).toHaveLength(1);
    expect(merged.products[0].name).toBe('Моя модель');
  });
  it('preserves promotion expiry and permits only explicit size systems when filling gaps', async () => {
    const store = new ManualProducts(new Memory());
    const p = product();
    const end = new Date(Date.now() + 3600000).toISOString();
    const d = await store.createDraft(
      { ...p, saleEndsAt: end, sizes: [''], sizePrices: [{ ...p.sizePrices![0], size: '' }] },
      'owner',
    );
    await expect(
      store.publish({ ...input(d.draftId), selections: [{ index: 0, size: '42' }] }),
    ).rejects.toMatchObject({ status: 400 });
    const saved = await store.publish({
      ...input(d.draftId),
      selections: [{ index: 0, size: 'EU 42' }],
    });
    expect(saved.saleEndsAt).toBe(end);
  });
  it('refreshes manually selected variants from a newer collector snapshot', async () => {
    const store = new ManualProducts(new Memory()),
      p = product();
    const d = await store.createDraft(p, 'owner');
    await store.publish(input(d.draftId));
    const newest = {
      ...p,
      sourceUpdatedAt: new Date(Date.now() + 1000).toISOString(),
      sizePrices: [
        { size: 'EU 41', salePrice: '30', saleKzt: 15000 },
        { size: 'EU 42', salePrice: '60', saleKzt: 30000 },
      ],
    };
    const result = (await store.combine([newest])).products[0];
    expect(result.name).toBe('Моя модель');
    expect(result.sizes).toEqual(['EU 42']);
    expect(result.saleKzt).toBe(30000);
    expect(withSellingPrices(result).saleKzt).toBe(33600);
  });
});
describe('link import', () => {
  const url = 'https://www.fila.de/test';
  const html = (data: unknown) =>
    `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  const offer = {
    '@type': 'Offer',
    price: '39.99',
    priceCurrency: 'EUR',
    availability: 'https://schema.org/InStock',
  };
  const item = {
    '@type': 'Product',
    name: 'FILA test',
    url,
    sku: '123',
    image: '/photo.jpg',
    offers: offer,
  };
  it('reads exact fixed offers and separate variants', () => {
    expect(extractLinkQuote(html(item), url)).toMatchObject({
      name: 'FILA test',
      sku: '123',
      variants: [{ size: '', price: '39.99' }],
    });
    const group = {
      '@type': 'ProductGroup',
      name: 'FILA',
      url,
      hasVariant: [
        { '@type': 'Product', size: 'EU 41', offers: offer },
        { '@type': 'Product', size: 'EU 42', offers: { ...offer, price: '49.99' } },
      ],
    };
    expect(extractLinkQuote(html(group), url).variants).toEqual([
      { size: 'EU 41', price: '39.99' },
      { size: 'EU 42', price: '49.99' },
    ]);
  });
  it('rejects price ranges, sold out products, ambiguous prices, and unrelated recommendations', () => {
    for (const offers of [
      { '@type': 'AggregateOffer', lowPrice: 10, highPrice: 90 },
      { ...offer, availability: 'OutOfStock' },
      [offer, { ...offer, price: '99' }],
    ])
      expect(() => extractLinkQuote(html({ ...item, offers }), url)).toThrow();
    expect(() => extractLinkQuote(html({ ...item, url: url + '-other' }), url)).toThrow();
    expect(() => extractLinkQuote('<h1>Access denied</h1>', url)).toThrow();
  });
  it('allows only supported HTTPS regions and canonicalizes tracking without dropping variants', () => {
    expect(manualSource(url).market).toBe('EU');
    for (const bad of [
      'http://www.fila.de/test',
      'https://127.0.0.1/test',
      'https://www.fila.de.evil.test/test',
      'https://a:b@www.fila.de/test',
      'https://www.adidas.com/kz/test',
    ])
      expect(() => manualSource(bad)).toThrow();
    expect(canonicalProductUrl(url + '?size=42&utm_source=mail#photo')).toBe(url + '?size=42');
  });
});
