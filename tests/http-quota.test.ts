import { afterEach, expect, it, vi } from 'vitest';
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));
import { fetchText } from '../src/lib/server/http';
afterEach(() => vi.unstubAllGlobals());
it('не повторяет запросы при исчерпанной месячной квоте', async () => {
  const fetch = vi.fn(
    async () =>
      new Response('{}', {
        status: 429,
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 86400),
        },
      }),
  );
  vi.stubGlobal('fetch', fetch);
  await expect(
    fetchText('https://cloud.seatable.io/test', { hosts: ['cloud.seatable.io'], attempts: 3 }),
  ).rejects.toMatchObject({ code: 'UPSTREAM_QUOTA_EXHAUSTED' });
  expect(fetch).toHaveBeenCalledTimes(1);
});
