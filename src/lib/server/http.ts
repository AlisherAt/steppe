import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { gunzipSync } from 'node:zlib';
export class IntegrationError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'IntegrationError';
  }
}
export function safeCode(error: unknown): string {
  return error instanceof IntegrationError ? error.code : 'INTERNAL_ERROR';
}
export function publicHttps(value: string, hosts: string[]): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IntegrationError('INVALID_URL');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !hosts.includes(url.hostname) ||
    isIP(url.hostname) ||
    !url.hostname.includes('.')
  )
    throw new IntegrationError('URL_NOT_ALLOWED');
  return url;
}
export function isPrivateAddress(address: string): boolean {
  if (address.includes(':')) return !/^[23][0-9a-f]{3}:/i.test(address); // Only global IPv6 unicast.
  const [a, b] = address.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
export async function fetchText(
  urlValue: string,
  options: {
    hosts: string[];
    token?: string;
    maxBytes?: number;
    attempts?: number;
    headers?: Record<string, string>;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: string;
  },
): Promise<string> {
  const url = publicHttps(urlValue, options.hosts);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address)))
    throw new IntegrationError('PRIVATE_NETWORK_BLOCKED');
  const maxBytes = options.maxBytes ?? 5_000_000;
  for (let attempt = 0; attempt < (options.attempts ?? 3); attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json, application/xml, text/xml',
          'User-Agent': 'SteppeDeals/1.0',
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          ...options.headers,
        },
        method: options.method || 'GET',
        body: options.body,
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) {
        const rawRetry = response.headers.get('retry-after') || '0';
        const retryAfter = /^\d+$/.test(rawRetry)
          ? Number(rawRetry)
          : Math.max(0, (Date.parse(rawRetry) - Date.now()) / 1000);
        if (retryAfter > 3) throw new IntegrationError('RATE_LIMITED');
        if (response.status === 429 || response.status >= 500) {
          if (retryAfter > 0) await new Promise((r) => setTimeout(r, retryAfter * 1000));
          throw new IntegrationError('UPSTREAM_TEMPORARY');
        }
        throw new IntegrationError(`UPSTREAM_HTTP_${response.status}`);
      }
      if (Number(response.headers.get('content-length')) > maxBytes)
        throw new IntegrationError('FEED_TOO_LARGE');
      if (!response.body) throw new IntegrationError('EMPTY_RESPONSE');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > maxBytes) {
          await reader.cancel();
          throw new IntegrationError('FEED_TOO_LARGE');
        }
        chunks.push(value);
      }
      const buffer = Buffer.concat(chunks);
      if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
        try {
          return gunzipSync(buffer, { maxOutputLength: maxBytes }).toString('utf8');
        } catch {
          throw new IntegrationError('INVALID_OR_OVERSIZED_GZIP');
        }
      }
      return buffer.toString('utf8');
    } catch (e) {
      if (e instanceof IntegrationError && e.code !== 'UPSTREAM_TEMPORARY') throw e;
      if (attempt === (options.attempts ?? 3) - 1)
        throw new IntegrationError('UPSTREAM_UNAVAILABLE');
      await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
    }
  }
  throw new IntegrationError('UPSTREAM_UNAVAILABLE');
}
export const splitHosts = (value: string | undefined) =>
  (value || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
