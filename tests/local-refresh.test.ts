import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireLock, directScraperEnv, summarizeRefresh } from '../scripts/local-refresh-lib.mjs';

test('локальный сбор не наследует прокси и ключи публикации', () => {
  const env = directScraperEnv({
    PATH: 'python-path',
    HTTP_PROXY: 'proxy',
    https_proxy: 'proxy',
    ALL_PROXY: 'proxy',
    SCRAPER_PROXY_URL: 'proxy',
    SCRAPER_PROXY_FILE: 'file',
    NODE_USE_ENV_PROXY: '1',
    CRON_SECRET: 'secret',
    SEATABLE_API_TOKEN: 'secret',
    GITHUB_TOKEN: 'secret',
    PYTHON_EXECUTABLE: 'python',
    SCRAPER_PERMISSIONS_JSON: '{"nike":"permission"}',
  });
  expect(env).toEqual({
    PATH: 'python-path',
    PYTHON_EXECUTABLE: 'python',
    SCRAPER_PERMISSIONS_JSON: '{"nike":"permission"}',
    PYTHON_SALE_PARSERS: '1',
  });
});

test('HTTP 502 с частичными результатами сохраняет реальные успехи и ошибки', () => {
  const result = summarizeRefresh(502, {
    results: [
      { source: 'puma-us', status: 'success', count: 4 },
      { source: 'adidas-us', status: 'error', code: 'RETAIL_SCRAPE_UNAVAILABLE' },
      { source: 'awin', status: 'needs_configuration' },
    ],
  });
  expect(result.updated).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.results[0].count).toBe(4);
  expect(() => summarizeRefresh(502, { error: 'gateway failed' })).toThrow();
  expect(() => summarizeRefresh(401, { results: [] })).toThrow();
  expect(() => summarizeRefresh(200, { skipped: true })).toThrow();
});

test('второй процесс не получает блокировку до завершения первого', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'steppe-lock-'));
  try {
    const path = join(directory, 'running.lock');
    const release = await acquireLock(path);
    expect(release).toBeTypeOf('function');
    expect(await acquireLock(path)).toBeNull();
    await release!();
    const second = await acquireLock(path);
    expect(second).toBeTypeOf('function');
    await second!();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
