import { test, expect } from 'vitest';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseProxy,
  parseProxyList,
  loadScraperProxy,
  fetchRobots,
  safeScraperError,
} from '../scripts/scraper-proxy.mjs';

test('прокси: форматы, авторизация, дедупликация, безопасные ошибки', () => {
  expect(parseProxy('192.0.2.1:8080')).toEqual({ server: 'http://192.0.2.1:8080' });
  expect(parseProxy('http://user:p%40ss@proxy.example:8080')).toEqual({
    server: 'http://proxy.example:8080',
    username: 'user',
    password: 'p@ss',
  });
  expect(
    parseProxyList('# comment\n192.0.2.1:8080\n192.0.2.1:8080\nsocks5://192.0.2.2:1080'),
  ).toHaveLength(2);
  for (const bad of [
    'ftp://proxy.example',
    'http://host:99999',
    'http://host/path',
    'http://host?secret=x',
    'socks5://u:p@host',
    '',
  ]) {
    expect(() => parseProxy(bad)).toThrow('INVALID_SCRAPER_PROXY');
  }
  const proxy = parseProxy('http://user:secret@proxy.example:8080');
  const text = safeScraperError(Error('failed proxy.example:8080 user secret\nstack'), proxy);
  expect(text).not.toMatch(/proxy\.example|user|secret|stack/);
});

test('прокси: явный стабильный индекс, нет молчаливого прямого подключения', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'steppe-proxy-'));
  try {
    const file = join(directory, 'list.txt');
    await writeFile(file, '192.0.2.1:8080\n192.0.2.2:8080');
    expect(await loadScraperProxy({})).toBeUndefined();
    const env = { SCRAPER_PROXY_FILE: file, SCRAPER_PROXY_INDEX: '1' };
    expect(await loadScraperProxy(env)).toEqual({ server: 'http://192.0.2.2:8080' });
    expect(await loadScraperProxy(env)).toEqual(await loadScraperProxy(env));
    await expect(loadScraperProxy({ ...env, SCRAPER_PROXY_INDEX: '5' })).rejects.toThrow(
      'INVALID_PROXY_INDEX',
    );
    await expect(loadScraperProxy({ ...env, SCRAPER_PROXY_URL: 'host:80' })).rejects.toThrow(
      'AMBIGUOUS_SCRAPER_PROXY',
    );
    await expect(
      loadScraperProxy({ SCRAPER_PROXY_FILE: join(directory, 'missing') }),
    ).rejects.toThrow('PROXY_FILE_UNREADABLE');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('robots действительно загружается через прокси; 403 и редиректы сохраняются', async () => {
  const urls: string[] = [];
  const server = createServer((req, res) => {
    urls.push(req.url || '');
    if (req.url?.includes('/deny')) {
      res.writeHead(403);
      res.end('Denied');
    } else if (req.url?.includes('/redirect')) {
      res.writeHead(302, { Location: 'http://unreachable.invalid/secret' });
      res.end();
    } else {
      res.end('User-agent: *\nDisallow: /private');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  // Playwright туннелирует запросы методом CONNECT, даже для HTTP.
  server.on('connect', (_req, socket, head) => {
    const upstream = connect(address.port, '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    });
    socket.on('error', () => upstream.destroy());
    socket.on('close', () => upstream.destroy());
    upstream.on('error', () => socket.destroy());
  });
  const proxy = { server: `http://127.0.0.1:${address.port}` };
  try {
    expect(await fetchRobots('http://unreachable.invalid/robots.txt', proxy)).toEqual({
      status: 200,
      body: 'User-agent: *\nDisallow: /private',
    });
    expect((await fetchRobots('http://unreachable.invalid/deny', proxy)).status).toBe(403);
    expect((await fetchRobots('http://unreachable.invalid/redirect', proxy)).status).toBe(302);
    expect(urls).toHaveLength(3);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
