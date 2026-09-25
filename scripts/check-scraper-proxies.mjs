import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { request } from '@playwright/test';
import { parseProxyList } from './scraper-proxy.mjs';

// Проверяем только публичную HTTPS-страницу, без аккаунтов и секретов STEPPE.
async function main() {
  if (!process.env.SCRAPER_PROXY_FILE) throw Error('SET_SCRAPER_PROXY_FILE');
  const proxies = parseProxyList(await readFile(process.env.SCRAPER_PROXY_FILE, 'utf8'));
  const results = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 16 }, async () => {
      while (cursor < proxies.length) {
        const index = cursor++;
        const started = Date.now();
        const row = { index, usable: false };
        let client;
        try {
          client = await request.newContext({ proxy: proxies[index], ignoreHTTPSErrors: false });
          const response = await client.get('https://example.com/', {
            timeout: 7000,
            maxRedirects: 0,
          });
          row.httpStatus = response.status();
          row.usable =
            response.ok() && (await response.text()).includes('<title>Example Domain</title>');
          if (!row.usable) row.error = 'UNEXPECTED_RESPONSE';
        } catch (error) {
          const message = String(error.message);
          row.error = /timed out|Timeout/i.test(message)
            ? 'TIMEOUT'
            : /certificate|SSL|TLS/i.test(message)
              ? 'TLS_ERROR'
              : /407/.test(message)
                ? 'PROXY_AUTH_REQUIRED'
                : 'CONNECTION_FAILED';
        } finally {
          await client?.dispose();
        }
        row.durationMs = Date.now() - started;
        results.push(row);
        if (row.usable || results.length % 50 === 0)
          console.log(
            JSON.stringify({
              checked: results.length,
              total: proxies.length,
              usable: results.filter((r) => r.usable).length,
              ...(row.usable ? { index } : {}),
            }),
          );
      }
    }),
  );
  results.sort((a, b) => a.index - b.index);
  await mkdir('artifacts', { recursive: true });
  await writeFile(
    'artifacts/proxy-check.json',
    JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2),
  );
  console.log(
    JSON.stringify({
      checked: results.length,
      usable: results.filter((r) => r.usable).map((r) => r.index),
      report: 'artifacts/proxy-check.json',
    }),
  );
}
// После таймаутов у транспорта могут оставаться сокеты. Отчёт уже записан,
// все контексты освобождены; завершаем одноразовую CLI-проверку явно.
main()
  .then(() => process.exit(0))
  .catch(() => {
    console.error('PROXY_CHECK_FAILED');
    process.exit(1);
  });
