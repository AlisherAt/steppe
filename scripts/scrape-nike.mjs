import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { collectNike } from './nike-collector.mjs';
import { acquireLock } from './local-refresh-lib.mjs';
const permissions = JSON.parse(process.env.SCRAPER_PERMISSIONS_JSON || '{}');
if (
  !process.argv.includes('--authorized') &&
  !(typeof permissions.nike === 'string' && permissions.nike.trim())
)
  throw Error('SOURCE_PERMISSION_REQUIRED');
await mkdir('artifacts/nike-live', { recursive: true });
const release = await acquireLock('artifacts/nike-live/collector.lock');
if (!release) throw Error('NIKE_COLLECTOR_ALREADY_RUNNING');
try {
  const result = await collectNike();
  const report = {
    runId: randomUUID(),
    checkedAt: new Date().toISOString(),
    published: 0,
    reports: [
      {
        source: 'nike',
        brand: 'Nike',
        status: result.status,
        count: result.products.length,
        ...(result.error ? { error: result.error } : {}),
      },
    ],
    products: result.products,
  };
  await writeFile('artifacts/nike-report.json', JSON.stringify(report));
  console.log(
    JSON.stringify({
      status: result.status,
      count: report.products.length,
      checked: result.state.checked,
      discovered: result.state.discovered,
    }),
  );
  if (result.status === 'error') process.exitCode = 2;
} finally {
  await release();
}
