import { expect, it } from 'vitest';
import { retailScrapeProduct } from '../src/lib/server/scraped-retail';
import { toProduct } from '../src/lib/server/adapters';
import { orderableProduct } from '../src/lib/orderable';
import { scrapeReportSchema } from '../src/lib/server/scrape-report';
import { whatsappOrder } from '../src/lib/whatsapp';
import { officialMarketUrl } from '../src/lib/official-stores';
import { reebokVariants } from '../scripts/retail-details.mjs';
const date = new Date().toISOString();
const row = {
  source: 'reebok',
  brand: 'Reebok',
  sku: '100279092',
  name: 'Test shoes',
  product_url: 'https://www.reebok.com/products/test',
  image_url: 'https://www.reebok.com/test.jpg',
  currency: 'USD',
  gender: 'men',
  size_price_verified: true,
  checked_at: date,
  variants: [
    {
      id: '1',
      size: 'US M 7',
      salePrice: '99.99',
      originalPrice: '150.00',
      available: true,
      checkedAt: date,
    },
    {
      id: '2',
      size: 'US M 8',
      salePrice: '109.99',
      originalPrice: '150.00',
      available: true,
      checkedAt: date,
    },
  ],
};
it('Официальные магазины: цены разных размеров сохраняются в тенге и WhatsApp', () => {
  const feed = retailScrapeProduct(row)!;
  const p = toProduct(feed, { id: 'reebok-us', name: 'Reebok US' }, [
    { currency: 'USD', value: '500', source: 'test', asOf: date, fetchedAt: date },
  ]);
  expect(p.sizePrices?.map((v) => v.saleKzt)).toEqual([49995, 54995]);
  expect(orderableProduct(p)).toBe(true);
  expect(p.warehouseCountry).toBeUndefined();
  const text = new URL(
    whatsappOrder('77001234567', [{ id: p.id, size: 'US M 8' }], [p]),
  ).searchParams.get('text')!;
  expect(text).toContain('US M 8');
  expect(text).not.toContain('EU US');
  expect(text).not.toContain(p.productUrl);
});
it('FILA: EUR и EU не смешиваются с американским рынком', () => {
  const fila = {
    ...row,
    source: 'fila',
    brand: 'Fila',
    sku: '1716266',
    product_url: 'https://www.fila.de/Herren/Schuhe/Sneaker/test-1716266.html',
    image_url: 'https://www.fila.de/test.jpg',
    currency: 'EUR',
    variants: [{ ...row.variants[0], size: 'EU 43' }],
  };
  const feed = retailScrapeProduct(fila)!;
  expect(feed.market).toBe('EU');
  expect(feed.currency).toBe('EUR');
  const p = toProduct(feed, { id: 'fila-eu', name: 'Fila EU' }, [
    { currency: 'EUR', value: '600', source: 'test', asOf: date, fetchedAt: date },
  ]);
  expect(p.saleKzt).toBe(59994);
  expect(orderableProduct(p)).toBe(true);
  expect(orderableProduct({ ...p, market: 'US' })).toBe(false);
  expect(retailScrapeProduct({ ...fila, currency: 'USD' })).toBeNull();
  expect(officialMarketUrl(fila.product_url, 'US')).toBe(false);
  expect(
    scrapeReportSchema.safeParse({
      runId: 'test',
      checkedAt: date,
      published: 0,
      reports: [],
      products: [{ ...fila, old_price: 150, sale_price: 99.99 }],
    }).success,
  ).toBe(true);
});
it('Отклоняются подмена домена, валюта, дубли, отсутствующие и устаревшие варианты', () => {
  for (const patch of [
    { product_url: 'https://www.reebok.com.evil.example/test' },
    { currency: 'EUR' },
    { variants: [row.variants[0], row.variants[0]] },
    { checked_at: new Date(0).toISOString() },
    { variants: [{ ...row.variants[0], available: false }] },
    { variants: [{ ...row.variants[0], salePrice: '150.00' }] },
    { variants: [{ ...row.variants[0], size: '42' }] },
  ])
    expect(retailScrapeProduct({ ...row, ...patch })).toBeNull();
});
it('Reebok: цена в центах сверяется с оффером; нет подмены размера из артикула', () => {
  const product = {
    vendor: 'Reebok',
    type: 'Shoes',
    tags: ['unisex'],
    variants: [
      {
        id: 1,
        option2: 'M 7 / W 8',
        sku: '100279092-8',
        price: 9999,
        compare_at_price: 15000,
        available: true,
      },
    ],
  };
  const offers = [
    {
      url: 'https://www.reebok.com/products/test?variant=1',
      price: '99.99',
      priceCurrency: 'USD',
      availability: 'http://schema.org/ InStock',
    },
  ];
  expect(reebokVariants(product, offers, ['M 7 / W 8'], date)[0]).toMatchObject({
    size: 'US M 7',
    salePrice: '99.99',
  });
  expect(reebokVariants(product, [{ ...offers[0], price: '105' }], ['M 7 / W 8'])).toEqual([]);
  expect(reebokVariants(product, offers, [])).toEqual([]);
});
