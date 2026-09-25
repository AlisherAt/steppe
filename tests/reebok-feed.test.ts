import { expect, it } from 'vitest';
import { reebokPublicProduct } from '../scripts/reebok-feed.mjs';
import { retailScrapeSchema } from '../src/lib/retail-scrapes';
const fixture = () => ({
  id: 12345,
  title: 'Nano X5 Training Shoes',
  handle: 'nano-x5',
  vendor: 'Reebok',
  product_type: 'Shoes',
  published_at: new Date().toISOString(),
  tags: ['men'],
  options: [
    { name: 'Color', position: 1 },
    { name: 'Size', position: 2 },
  ],
  images: [{ src: 'https://www.reebok.com/cdn/shop/files/nano.jpg' }],
  variants: [
    {
      id: 1,
      sku: '100279092-M-7',
      option2: 'M 7 / W 8',
      available: true,
      price: '99.99',
      compare_at_price: '150.00',
    },
    {
      id: 2,
      sku: '100279092-M-8',
      option2: 'M 8 / W 9',
      available: true,
      price: '109.99',
      compare_at_price: '150.00',
    },
    {
      id: 3,
      sku: '100279092-M-9',
      option2: 'M 9 / W 10',
      available: false,
      price: '79.99',
      compare_at_price: '150.00',
    },
  ],
});
it('keeps decimal USD prices, exact available sizes and the authentic style ID', () => {
  const p = reebokPublicProduct(fixture(), 'USD');
  if (!p) throw Error('Expected verified product');
  expect(retailScrapeSchema.safeParse(p).success).toBe(true);
  expect(p.sku).toBe('100279092');
  expect(p.variants.map((v) => [v.size, v.salePrice])).toEqual([
    ['US M 7', '99.99'],
    ['US M 8', '109.99'],
  ]);
});
it('rejects unavailable, undiscounted, non-shoe and wrong-currency offers', () => {
  const p = fixture();
  p.variants.forEach((v) => (v.compare_at_price = v.price));
  expect(reebokPublicProduct(p, 'USD')).toBeNull();
  expect(reebokPublicProduct({ ...fixture(), product_type: 'Clothing' }, 'USD')).toBeNull();
  expect(() => reebokPublicProduct(fixture(), 'EUR')).toThrow('CURRENCY');
});
it('does not guess ambiguous variant sizes', () => {
  const p = fixture();
  p.variants[1].option2 = p.variants[0].option2;
  expect(() => reebokPublicProduct(p, 'USD')).toThrow('AMBIGUOUS');
});
