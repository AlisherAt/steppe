import { readFile } from 'node:fs/promises';
const secret = process.env.CRON_SECRET;
if (!secret || secret.length < 32) throw Error('CRON_SECRET_MISSING');
const url = new URL(
  '/api/cron/scrape-report',
  process.env.STEPPE_SITE_URL || 'https://steppe-gray.vercel.app',
);
if (url.protocol !== 'https:') throw Error('HTTPS_REQUIRED');
const body = await readFile('artifacts/scraper.json', 'utf8');
const response = await fetch(url, {
  method: 'POST',
  redirect: 'error',
  headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
  body,
  signal: AbortSignal.timeout(60000),
});
if (!response.ok) throw Error(`REPORT_UPLOAD_HTTP_${response.status}`);
console.log(JSON.stringify(await response.json()));
