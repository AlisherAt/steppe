import { afterEach, expect, it, vi } from 'vitest';
import { demoEnabled } from '../src/lib/catalog-mode';
afterEach(() => vi.unstubAllEnvs());
it('отключает демокаталог в production, сохраняя его для локальной разработки', () => {
  vi.stubEnv('NODE_ENV', 'production');
  expect(demoEnabled()).toBe(false);
  vi.stubEnv('NODE_ENV', 'development');
  expect(demoEnabled()).toBe(true);
});
