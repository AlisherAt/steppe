import { afterEach, expect, it, vi } from 'vitest';
import { demoProducts } from '../src/lib/demo';
const mocks = vi.hoisted(() => ({
  fetch: vi.fn().mockResolvedValue([]),
  rates: vi.fn().mockResolvedValue([]),
  start: vi.fn().mockResolvedValue({ id: 'run' }),
  commit: vi.fn(),
  decode: vi.fn(),
}));
vi.mock('../src/lib/server/seatable-client', () => ({ seaClient: { ensureSchema: vi.fn() } }));
vi.mock('../src/lib/server/seatable-store', () => ({
  latestRun: () => ({ id: 'previous', started_at: '2026-09-24T10:00:00Z' }),
  decodeSnapshot: mocks.decode,
  seaStore: {
    ensureSources: async () => [{ id: 'adidas', paused: false }],
    prune: async () => {},
    state: async () => ({ runs: [], offers: [] }),
    start: mocks.start,
    commit: mocks.commit,
    failure: vi.fn(),
  },
}));
vi.mock('../src/lib/server/sources', () => ({
  getAdapters: () => [
    {
      id: 'adidas',
      name: 'Adidas',
      configured: () => true,
      fetchProducts: mocks.fetch,
    },
  ],
}));
vi.mock('../src/lib/server/rates', () => ({ loadRates: mocks.rates, nativeRate: vi.fn() }));
import { refreshSeaTable } from '../src/lib/server/seatable-refresh';
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
it('не вызывает магазин и курс во время акции; возобновляет запрос после окончания', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-25T10:00:00Z'));
  mocks.decode.mockReturnValue([
    { ...demoProducts[0], updatedAt: '2026-09-24T10:00:00Z', saleEndsAt: '2026-10-01T10:00:00Z' },
  ]);
  expect((await refreshSeaTable()).results[0]).toMatchObject({
    source: 'adidas',
    status: 'deferred',
  });
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.rates).not.toHaveBeenCalled();
  expect(mocks.start).not.toHaveBeenCalled();
  vi.setSystemTime(new Date('2026-10-01T10:00:00Z'));
  expect((await refreshSeaTable()).results[0].status).toBe('success');
  expect(mocks.fetch).toHaveBeenCalledOnce();
  expect(mocks.commit).toHaveBeenCalledOnce();
});
