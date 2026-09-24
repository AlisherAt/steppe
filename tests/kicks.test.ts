import { afterEach, expect, it, vi } from 'vitest';
import { parseKicksProducts, searchKicksProducts } from '../src/lib/server/kicks';
import { fetchText } from '../src/lib/server/http';
vi.mock('../src/lib/server/http', async (original) => ({
  ...(await original<object>()),
  fetchText: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const data = [
  {
    id: 'fixture',
    title: 'Fixture sneaker',
    brand: 'Adidas',
    sku: 'TEST',
    product_type: 'sneakers',
    link: 'https://stockx.com/fixture',
    updated_at: '2026-09-24T10:00:00.123456789Z',
    variants: [
      {
        id: 'size',
        size: '9',
        size_type: 'us m',
        lowest_ask: 80,
        total_asks: 2,
        currency: 'USD',
        market: 'US',
        updated_at: '2026-09-24T10:00:00Z',
      },
    ],
  },
];
it('сохраняет валюту, рынок, размер и время источника, не создаёт скидку или доставку', () => {
  const p = parseKicksProducts({ data })[0];
  expect(p.variants[0]).toMatchObject({
    currency: 'USD',
    market: 'US',
    size_type: 'us m',
    lowest_ask: 80,
  });
  expect(p).not.toHaveProperty('discount');
  expect(p).not.toHaveProperty('delivery');
  expect(() =>
    parseKicksProducts({ data: [{ ...data[0], link: 'https://evil.example/' }] }),
  ).toThrow('INVALID_KICKS_PRODUCT_URL');
  expect(() => parseKicksProducts({ data: null })).toThrow('INVALID_KICKS_RESPONSE');
});
it('использует ключ только в заголовке, один запрос и ограниченную выборку', async () => {
  vi.stubEnv('KICKS_API_KEY', 'test-only-key');
  vi.mocked(fetchText).mockResolvedValue(JSON.stringify({ data }));
  expect(await searchKicksProducts('adidas', 1)).toHaveLength(1);
  const [url, options] = vi.mocked(fetchText).mock.calls[0];
  expect(url).not.toContain('test-only-key');
  expect(new URL(url).searchParams.get('display[prices]')).toBe('true');
  expect(options).toMatchObject({ token: 'test-only-key', attempts: 1, hosts: ['api.kicks.dev'] });
  await expect(searchKicksProducts('adidas', 101)).rejects.toThrow('INVALID_KICKS_QUERY');
  expect(fetchText).toHaveBeenCalledOnce();
});

it('принимает партнёрскую ссылку только с назначением StockX', () => {
  const link =
    'https://stockx.pvxt.net/c/test?u=' + encodeURIComponent('https://stockx.com/fixture');
  expect(parseKicksProducts({ data: [{ ...data[0], link }] })[0].link).toBe(link);
  expect(() =>
    parseKicksProducts({
      data: [{ ...data[0], link: 'https://stockx.pvxt.net/c/test?u=https%3A%2F%2Fevil.example' }],
    }),
  ).toThrow('INVALID_KICKS_PRODUCT_URL');
});
