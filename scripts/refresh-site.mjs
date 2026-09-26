const secret = process.env.CRON_SECRET;
if (!secret || secret.length < 32) throw Error('CRON_SECRET_MISSING');
const url = new URL(
  '/api/cron/refresh',
  process.env.STEPPE_SITE_URL || 'https://steppe-gray.vercel.app',
);
if (url.protocol !== 'https:') throw Error('HTTPS_REQUIRED');
for (let attempt = 0; attempt < 3; attempt++) {
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(310000),
  });
  const data = await response.json();
  if (data.skipped && data.reason === 'already_running' && attempt < 2) {
    await new Promise((r) => setTimeout(r, 10000));
    continue;
  }
  console.log(JSON.stringify(data));
  if (
    !response.ok ||
    !Array.isArray(data.results) ||
    data.results.some((r) => r.status === 'error')
  )
    process.exitCode = 1;
  break;
}
