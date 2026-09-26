import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const secret = process.env.CRON_SECRET;
if (!secret || secret.length < 32) throw Error('CRON_SECRET_MISSING');
const url = new URL(
  '/api/cron/scrape-report',
  process.env.STEPPE_SITE_URL || 'https://steppe-gray.vercel.app',
);
if (url.protocol !== 'https:') throw Error('HTTPS_REQUIRED');
const raw = await readFile(process.argv[2] || 'artifacts/scraper.json', 'utf8');
const report = JSON.parse(raw);
if (!report.runId || !Array.isArray(report.products) || !Array.isArray(report.reports))
  throw Error('INVALID_REPORT');
if (Buffer.byteLength(raw) > 24_000_000) throw Error('REPORT_TOO_LARGE');
const compressed = Buffer.byteLength(raw) > 2_000_000;
const body = compressed ? gzipSync(raw) : raw;
if (Buffer.byteLength(body) > 3_000_000) throw Error('REPORT_TOO_LARGE');
const response = await fetch(url, {
  method: 'POST',
  redirect: 'error',
  headers: {
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json',
    ...(compressed ? { 'Content-Encoding': 'gzip' } : {}),
  },
  body,
  signal: AbortSignal.timeout(310000),
});
if (!response.ok) throw Error(`REPORT_UPLOAD_HTTP_${response.status}`);
console.log(JSON.stringify(await response.json()));
