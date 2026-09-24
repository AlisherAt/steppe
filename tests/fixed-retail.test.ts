import { expect, it } from 'vitest';
import { parseFixedRetail } from '../src/lib/server/fixed-retail';
import { getAdapters } from '../src/lib/server/sources';
import { orderableProduct } from '../src/lib/orderable';
import { toProduct } from '../src/lib/server/adapters';
import { demoProducts } from '../src/lib/demo';
const now = Date.now(),
  date = new Date(now).toISOString();
const row = {
  id: 'shoe',
  name: 'Sneaker',
  brand: 'Nike',
  productUrl: 'https://shop.example/shoe',
  imageUrl: null,
  purchaseType: 'fixed',
  warehouseCountry: 'US',
  currency: 'USD',
  variants: [
    { id: 'size42', sizeEU: '42', price: '80', stock: 2, checkedAt: date },
    { id: 'size43', sizeEU: '43', price: '100', stock: 1, checkedAt: date },
    { id: 'size44', sizeEU: '44', price: '75', stock: 0, checkedAt: date },
  ],
};
const feed = (p = row) => ({ version: 1, complete: true, generatedAt: date, products: [p] });
it('imports fixed in-stock size prices with warehouse evidence and converts them', () => {
  const offer = parseFixedRetail(feed(), 'US', now)[0];
  expect(offer.sizes).toEqual(['42', '43']);
  const product = toProduct(offer, { id: 'retail-us', name: 'Supplier' }, [
    { currency: 'USD', value: '500', source: 'test', asOf: date, fetchedAt: date },
  ]);
  expect(product.sizePrices?.map((v) => v.saleKzt)).toEqual([40000, 50000]);
  expect(orderableProduct(product)).toBe(true);
  expect(orderableProduct({ ...product, warehouseCountry: 'CN' })).toBe(false);
});
it('rejects bids, wrong warehouse, stale prices and ambiguous sizes', () => {
  expect(() => parseFixedRetail(feed({ ...row, purchaseType: 'bid' }), 'US', now)).toThrow();
  expect(parseFixedRetail(feed({ ...row, warehouseCountry: 'DE' }), 'US', now)).toEqual([]);
  expect(parseFixedRetail(feed({ ...row, warehouseCountry: 'DE' }), 'EU', now)).toHaveLength(1);
  expect(
    parseFixedRetail(
      feed({
        ...row,
        variants: row.variants.map((v) => ({ ...v, checkedAt: new Date(0).toISOString() })),
      }),
      'US',
      now,
    ),
  ).toEqual([]);
  expect(() =>
    parseFixedRetail(feed({ ...row, variants: [row.variants[0], row.variants[0]] }), 'US', now),
  ).toThrow();
});
it('does not register StockX and refuses market observations for checkout', () => {
  expect(getAdapters().some((s) => s.id === 'kicks-stockx')).toBe(false);
  expect(orderableProduct({ ...demoProducts[0], offerKind: 'market', market: 'US' })).toBe(false);
});
