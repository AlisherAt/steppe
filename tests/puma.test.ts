import { expect, it } from 'vitest';
import { pumaFeedProduct } from '../src/lib/server/puma';
import { toProduct } from '../src/lib/server/adapters';
import { orderableProduct } from '../src/lib/orderable';
import { scrapeReportSchema } from '../src/lib/server/scrape-report';
const date = new Date().toISOString();
const row = {
  source: 'puma',
  brand: 'Puma',
  sku: '402666_01',
  name: 'ST Miler Retro',
  product_url: 'https://us.puma.com/us/en/pd/st-miler-retro/402666?swatch=01',
  image_url: 'https://images.puma.com/test.jpg',
  currency: 'USD',
  gender: 'men',
  size_price_verified: true,
  checked_at: date,
  variants: [
    {
      id: '0200',
      sizeUS: '7',
      sizeEU: '39',
      salePrice: '44.99',
      originalPrice: '65.00',
      available: true,
      checkedAt: date,
    },
    {
      id: '0210',
      sizeUS: '7.5',
      sizeEU: '40',
      salePrice: '49.99',
      originalPrice: '65.00',
      available: true,
      checkedAt: date,
    },
  ],
};
it('Puma: сохраняет цены размеров, скидку и рынок без выдуманного склада', () => {
  const feed = pumaFeedProduct(row)!;
  expect(feed.sizes).toEqual(['39', '40']);
  expect(feed.originalPrice).toBe('65.00');
  const p = toProduct(feed, { id: 'puma-us', name: 'Puma US' }, [
    { currency: 'USD', value: '500', source: 'test', asOf: date, fetchedAt: date },
  ]);
  expect(p.sizePrices?.map((v) => v.saleKzt)).toEqual([22495, 24995]);
  expect(p.warehouseCountry).toBeUndefined();
  expect(orderableProduct(p)).toBe(true);
});
it('Puma: отклоняет подмену домена/цвета, старые данные и дубли размеров', () => {
  expect(pumaFeedProduct({ ...row, product_url: 'https://evil.example/test' })).toBeNull();
  expect(pumaFeedProduct({ ...row, sku: '402666_02' })).toBeNull();
  expect(pumaFeedProduct({ ...row, checked_at: new Date(0).toISOString() })).toBeNull();
  expect(pumaFeedProduct({ ...row, variants: [row.variants[0], row.variants[0]] })).toBeNull();
  expect(
    pumaFeedProduct({ ...row, variants: [{ ...row.variants[0], available: false }] }),
  ).toBeNull();
  expect(pumaFeedProduct({ ...row, size_price_verified: false })).toBeNull();
});
it('Puma: отчёт принимает только полное подтверждение размеров', () => {
  const report = {
    runId: 'test',
    checkedAt: date,
    published: 0,
    reports: [],
    products: [{ ...row, old_price: 65, sale_price: 44.99 }],
  };
  expect(scrapeReportSchema.safeParse(report).success).toBe(true);
  expect(
    scrapeReportSchema.safeParse({ ...report, products: [{ ...report.products[0], variants: [] }] })
      .success,
  ).toBe(false);
});
