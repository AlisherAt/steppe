import { readFile } from 'node:fs/promises';
import { request } from '@playwright/test';

// Адреса и пароли никогда не включаются в сообщения ошибок.
export function parseProxy(value) {
  try {
    const raw = value.trim();
    if (!raw || /\s/.test(raw)) throw Error();
    const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
    if (
      !['http:', 'https:', 'socks5:'].includes(url.protocol) ||
      !url.hostname ||
      (url.pathname !== '' && url.pathname !== '/') ||
      url.search ||
      url.hash
    )
      throw Error();
    const proxy = { server: `${url.protocol}//${url.host}` };
    if (url.username || url.password) {
      if (url.protocol === 'socks5:') throw Error();
      proxy.username = decodeURIComponent(url.username);
      proxy.password = decodeURIComponent(url.password);
    }
    return proxy;
  } catch {
    throw Error('INVALID_SCRAPER_PROXY');
  }
}

export function parseProxyList(text) {
  if (text.length > 1_000_000) throw Error('PROXY_LIST_TOO_LARGE');
  const lines = [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith('#')),
    ),
  ];
  if (!lines.length || lines.length > 1000) throw Error('INVALID_PROXY_LIST_SIZE');
  return lines.map(parseProxy);
}

/** @param {Record<string, string | undefined>} env */
export async function loadScraperProxy(env = process.env) {
  if (env.SCRAPER_PROXY_URL && env.SCRAPER_PROXY_FILE) throw Error('AMBIGUOUS_SCRAPER_PROXY');
  if (env.SCRAPER_PROXY_URL) return parseProxy(env.SCRAPER_PROXY_URL);
  if (!env.SCRAPER_PROXY_FILE) return undefined;
  let content;
  try {
    content = await readFile(env.SCRAPER_PROXY_FILE, 'utf8');
  } catch {
    throw Error('PROXY_FILE_UNREADABLE');
  }
  const list = parseProxyList(content);
  const index = Number(env.SCRAPER_PROXY_INDEX || 0);
  if (!Number.isInteger(index) || index < 0 || index >= list.length)
    throw Error('INVALID_PROXY_INDEX');
  // Один выходной адрес на весь запуск. Ошибка магазина не меняет прокси.
  return list[index];
}

export async function fetchRobots(url, proxy) {
  if (!proxy) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'SteppeSaleCollector/1.0' },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    return { status: response.status, body: response.status === 404 ? '' : await response.text() };
  }
  const client = await request.newContext({ proxy, ignoreHTTPSErrors: false });
  try {
    const response = await client.get(url, {
      headers: { 'User-Agent': 'SteppeSaleCollector/1.0' },
      maxRedirects: 0,
      timeout: 15000,
    });
    return {
      status: response.status(),
      body: response.status() === 404 ? '' : await response.text(),
    };
  } catch {
    throw Error('PROXY_ROBOTS_REQUEST_FAILED');
  } finally {
    await client.dispose();
  }
}

export function safeScraperError(error, proxy) {
  let message = String(error?.message || error);
  if (proxy) {
    for (const value of [
      proxy.server,
      new URL(proxy.server).host,
      proxy.username,
      proxy.password,
    ]) {
      if (value) message = message.split(value).join('[proxy]');
    }
  }
  return message.split('\n')[0].slice(0, 200);
}
