import { expect, it } from 'vitest';
import { nextSalePage, sneakerName } from '../scripts/sale-catalog.mjs';
import { pumaEmbeddedVariants } from '../scripts/puma-details.mjs';
import { scrapeReportSchema } from '../src/lib/server/scrape-report';
it('Puma pagination keeps all supplied filters and rejects off-site navigation', () => {
  const url =
    'https://us.puma.com/us/en/sale/all-sale?filter_gender=%3E{men;women}&filter_product_division=%3E{shoes}&filter_sport_type=%3E{running;training}';
  const next = new URL(
    nextSalePage(url, 'https://us.puma.com/us/en/sale/all-sale?page=2', { url }),
  );
  expect(next.searchParams.get('page')).toBe('2');
  for (const [k, v] of new URL(url).searchParams) expect(next.searchParams.get(k)).toBe(v);
  expect(() => nextSalePage(url, 'https://other.example/sale', { url })).toThrow();
  expect(() => nextSalePage(url, 'https://us.puma.com/us/en/cart', { url })).toThrow();
});
it('excludes clothing, slides and cleats from sneaker collections', () => {
  for (const name of ['Nano Training Shoes', 'Classic Sneakers', 'Running Shoes'])
    expect(sneakerName(name)).toBe(true);
  for (const name of [
    'Classic T-Shirt',
    'Slide Shoes',
    'Football Cleats Shoes',
    'Boots',
    'Running Socks',
  ])
    expect(sneakerName(name)).toBe(false);
});
it('large collection reports accept more than 100 verified cards per source', () => {
  expect(
    scrapeReportSchema.safeParse({
      runId: 'full',
      checkedAt: new Date().toISOString(),
      published: 0,
      reports: [{ source: 'puma', brand: 'Puma', status: 'finished_observed_pages', count: 200 }],
      products: [],
    }).success,
  ).toBe(true);
});
function state(sku = '312060_14') {
  return {
    props: {
      urqlState: {
        price: {
          data: JSON.stringify({
            product: {
              id: '312060',
              variations: [
                { id: sku, orderable: true, productPrice: { price: 300, salePrice: 199.99 } },
              ],
            },
          }),
        },
        sizes: {
          data: JSON.stringify({
            product: {
              id: '312060',
              variations: [
                {
                  id: sku,
                  sizeGroups: [
                    {
                      sizes: [
                        { id: '0200', label: '9', orderable: true },
                        { id: '0210', label: '9.5', orderable: false },
                      ],
                    },
                  ],
                },
              ],
            },
          }),
        },
      },
    },
  };
}
it('embedded Puma sizes are tied to the exact style/color, live UI and explicit discount', () => {
  const enabled = [{ id: '0200', us: '9' }],
    conversion = { '9': '42', '9.5': '42.5' },
    price = { sale: 199.99, old: 300 };
  const result = pumaEmbeddedVariants(state(), '312060_14', conversion, enabled, price);
  expect(result).toHaveLength(1);
  expect(result![0]).toMatchObject({
    id: '0200',
    sizeEU: '42',
    sizeUS: '9',
    salePrice: '199.99',
    originalPrice: '300.00',
  });
  expect(
    pumaEmbeddedVariants(state('312060_01'), '312060_14', conversion, enabled, price),
  ).toBeNull();
  expect(pumaEmbeddedVariants(state(), '312060_14', conversion, [], price)).toBeNull();
  expect(
    pumaEmbeddedVariants(state(), '312060_14', conversion, enabled, { sale: 159.99, old: 300 }),
  ).toBeNull();
  expect(
    pumaEmbeddedVariants(
      state(),
      '312060_14',
      conversion,
      [...enabled, { id: '0210', us: '9.5' }],
      price,
    ),
  ).toBeNull();
});
