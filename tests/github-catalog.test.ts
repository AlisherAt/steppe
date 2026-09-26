import { afterEach, expect, it, vi } from 'vitest';
import nike from '../data/catalog/nike-us.json';
import { githubProducts } from '../src/lib/server/github-catalog';
import { getCatalog } from '../src/lib/server/repository';
import { cartProducts } from '../src/lib/server/cart-products';
import { defaultFilters } from '../src/lib/types';
import { sellingPrice } from '../src/lib/selling-price';
import { whatsappOrder } from '../src/lib/whatsapp';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('каталог и корзина работают без запросов к SeaTable и начисляют наценку один раз', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(nike.generatedAt));
  vi.stubEnv('CATALOG_PROVIDER', 'github');
  const fetch = vi.fn(() => {
    throw Error('DATABASE_MUST_NOT_BE_CALLED');
  });
  vi.stubGlobal('fetch', fetch);
  const result = await getCatalog({ ...defaultFilters, brands: ['Nike'] }, 'live');
  expect(result.total).toBe(500);
  expect(result.products[0].productUrl).toBe('');
  const [p] = await cartProducts([result.products[0].id]);
  const raw = nike.products.find((r) => r.id === p.id)!;
  expect(p.saleKzt).toBe(sellingPrice(raw.saleKzt));
  expect(p.sizePrices!.map((v) => v.saleKzt)).toEqual(
    raw.sizePrices.map((v) => sellingPrice(v.saleKzt)),
  );
  const text = new URL(
    whatsappOrder('77079223074', [{ id: p.id, size: p.sizes[0] }], [p]),
  ).searchParams.get('text')!;
  expect(text.replace(/\s/g, '')).toContain(String(p.sizePrices![0].saleKzt));
  expect(fetch).not.toHaveBeenCalled();
});
it('автоматически скрывает устаревшие снимки даже без нового деплоя', () => {
  expect(githubProducts(Date.parse(nike.generatedAt) + 8 * 86400000)).toHaveLength(0);
});
