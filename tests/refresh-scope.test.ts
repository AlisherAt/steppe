import { beforeEach, expect, it, vi } from 'vitest';
import { parseRefreshScope } from '../src/lib/refresh-scope';
const mocks = vi.hoisted(() => ({
  nike: vi.fn().mockResolvedValue([]),
  puma: vi.fn().mockResolvedValue([]),
  commit: vi.fn(),
}));
vi.mock('../src/lib/server/seatable-client', () => ({ seaClient: { ensureSchema: vi.fn() } }));
vi.mock('../src/lib/server/seatable-store', () => ({
  latestRun: () => undefined,
  decodeSnapshot: () => [],
  seaStore: {
    ensureSources: async (adapters: { id: string }[]) =>
      adapters.map((a) => ({ ...a, paused: false })),
    prune: async () => {},
    state: async () => ({ runs: [], offers: [] }),
    start: async (source: string) => ({ id: source, source_id: source }),
    commit: mocks.commit,
    failure: vi.fn(),
  },
}));
vi.mock('../src/lib/server/sources', () => ({
  getAdapters: () => [
    { id: 'nike-us', name: 'Nike', configured: () => true, fetchProducts: mocks.nike },
    { id: 'puma-us', name: 'Puma', configured: () => true, fetchProducts: mocks.puma },
  ],
}));
vi.mock('../src/lib/server/rates', () => ({ loadRates: async () => [], nativeRate: vi.fn() }));
import { refreshSeaTable } from '../src/lib/server/seatable-refresh';
beforeEach(() => vi.clearAllMocks());
it('выбор источников проверяется и не допускает неизвестные значения', () => {
  expect(parseRefreshScope(null)).toBeUndefined();
  expect(parseRefreshScope('nike-us,nike-us,puma-us')).toEqual(['nike-us', 'puma-us']);
  for (const value of ['', 'adidas', 'nike-us,', 'https://example.com'])
    expect(() => parseRefreshScope(value)).toThrow('INVALID_REFRESH_SOURCES');
});
it('обновление Nike не копирует каталог Puma', async () => {
  const result = await refreshSeaTable(['nike-us']);
  expect(result.results).toEqual([{ source: 'nike-us', status: 'success', count: 0 }]);
  expect(mocks.nike).toHaveBeenCalledOnce();
  expect(mocks.puma).not.toHaveBeenCalled();
});
it('параллельные запросы разных источников не подменяют результаты друг друга', async () => {
  const [nike, puma, duplicate] = await Promise.all([
    refreshSeaTable(['nike-us']),
    refreshSeaTable(['puma-us']),
    refreshSeaTable(['nike-us']),
  ]);
  expect(nike.results[0].source).toBe('nike-us');
  expect(puma.results[0].source).toBe('puma-us');
  expect(duplicate).toBe(nike);
  expect(mocks.nike).toHaveBeenCalledOnce();
  expect(mocks.puma).toHaveBeenCalledOnce();
});
