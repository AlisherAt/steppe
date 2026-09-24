import { afterEach, expect, it, vi } from 'vitest';
import { KicksAdapter, kicksOffers } from '../src/lib/server/kicks-adapter';
import { parseKicksProducts, searchKicksProducts } from '../src/lib/server/kicks';
import { toProduct } from '../src/lib/server/adapters';
import { parseNbk } from '../src/lib/server/rates';
vi.mock('../src/lib/server/kicks', async (original) => ({
  ...(await original<object>()),
  searchKicksProducts: vi.fn(),
}));
const now = Date.parse('2026-09-24T10:00:00Z');
const v = {
  id: 'v',
  size: '9',
  size_type: 'us m',
  sizes: [{ type: 'eu', size: 'EU 42' }],
  lowest_ask: 80,
  total_asks: 1,
  currency: 'USD',
  market: 'US',
  updated_at: new Date(now).toISOString(),
};
const products = parseKicksProducts({
  data: [
    {
      id: 'fixture',
      title: 'Test',
      brand: 'Adidas',
      sku: 'ABC123',
      product_type: 'sneakers',
      link: 'https://stockx.com/test',
      updated_at: new Date(now).toISOString(),
      variants: [
        v,
        { ...v, id: 'expensive', lowest_ask: 100, sizes: [{ type: 'eu', size: 'EU 43' }] },
      ],
    },
  ],
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
it('публикует только EU размеры по минимальной цене и не придумывает старую цену', () => {
  const offer = kicksOffers(products, now)[0];
  expect(offer).toMatchObject({
    salePrice: '80',
    originalPrice: null,
    sizes: ['42'],
    sku: 'ABC123',
    market: 'US',
  });
  const p = toProduct(offer, { id: 'kicks-stockx', name: 'StockX' }, [
    {
      currency: 'USD',
      value: '500',
      source: 'test',
      asOf: new Date(now).toISOString(),
      fetchedAt: new Date(now).toISOString(),
    },
  ]);
  expect(p).toMatchObject({ saleKzt: 40000, originalKzt: null, discount: 0, offerKind: 'market' });
  expect(p.delivery).toBeUndefined();
});
it('исключает старые, пустые, скрытые цены и другой рынок', () => {
  for (const change of [
    { market: 'UK' },
    { currency: 'EUR' },
    { total_asks: 0 },
    { hidden: true },
    { lowest_ask: 0 },
    { updated_at: '2026-09-20T00:00:00Z' },
    { sizes: [] },
  ]) {
    expect(kicksOffers([{ ...products[0], variants: [{ ...v, ...change }] }], now)).toEqual([]);
  }
});
it('ограничивает запросы и не публикует частично скачанную выборку', async () => {
  vi.stubEnv('KICKS_API_KEY', 'test');
  vi.mocked(searchKicksProducts).mockResolvedValue(products);
  await new KicksAdapter().fetchProducts();
  expect(searchKicksProducts).toHaveBeenCalledTimes(8);
  vi.mocked(searchKicksProducts).mockRejectedValueOnce(new Error('quota'));
  await expect(new KicksAdapter().fetchProducts()).rejects.toThrow('quota');
});
it('разбирает официальный ответ курса за конкретную дату', () => {
  const rates = parseNbk(
    '<rates><date>24.09.2026</date><item><title>USD</title><description>500</description><quant>1</quant></item></rates>',
    new Date(now),
  );
  expect(rates[0]).toMatchObject({
    currency: 'USD',
    value: '500.000000000000',
    asOf: '2026-09-23T19:00:00.000Z',
  });
});
