import { mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { sources } from '../scraper-sources.mjs';
import { fetchRobots } from '../scraper-proxy.mjs';
import { root, readWithAgentReach } from './runtime.mjs';
import { AGENT_REACH_REVISION, collectSource } from './catalog.mjs';

// Отдельный каталог отчётов: эксперимент не перезаписывает рабочий сбор Puma/Reebok.
async function main() {
  if (!process.argv.includes('--authorized'))
    throw Error(
      'SOURCE_PERMISSION_REQUIRED: используйте --authorized только при наличии разрешения магазина',
    );
  const ids = (process.env.REACH_SOURCE_IDS || 'adidas,nike').split(',').map((x) => x.trim());
  if (!ids.length || ids.some((id) => !['adidas', 'nike'].includes(id)))
    throw Error('INVALID_REACH_SOURCE_IDS');
  const limit = Number(process.env.REACH_DETAIL_LIMIT || 3);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10)
    throw Error('INVALID_REACH_DETAIL_LIMIT');
  await readWithAgentReach('doctor');
  const report = {
    runId: randomUUID(),
    checkedAt: new Date().toISOString(),
    backend: 'Agent Reach / Jina Reader',
    revision: AGENT_REACH_REVISION,
    published: 0,
    reports: [],
    products: [],
    observations: [],
  };
  const out = resolve(root, 'artifacts/agent-reach', report.runId);
  await mkdir(out, { recursive: true });
  for (const source of sources.filter((s) => ids.includes(s.id))) {
    console.log(JSON.stringify({ source: source.id, event: 'starting' }));
    const evidence = [];
    const result = await collectSource(source, {
      limit,
      read: readWithAgentReach,
      robots: async (s) => {
        const r = await fetchRobots(new URL('/robots.txt', s.url).href);
        await writeFile(resolve(out, `${s.id}-robots.txt`), r.body);
        return r;
      },
      wait: (ms) => new Promise((r) => setTimeout(r, ms)),
      savePage: async (name, text) => {
        const filename = `${source.id}-${name}.md`;
        await writeFile(resolve(out, filename), text);
        evidence.push({
          file: filename,
          sha256: createHash('sha256').update(text).digest('hex'),
          bytes: Buffer.byteLength(text),
        });
      },
    });
    const { observations, products, ...summary } = result;
    report.reports.push({ ...summary, evidence });
    report.products.push(...products);
    report.observations.push(...observations);
    console.log(JSON.stringify(summary));
  }
  report.checkedAt = new Date().toISOString();
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  const latest = resolve(root, 'artifacts/agent-reach/latest.json');
  await writeFile(`${latest}.${report.runId}.tmp`, JSON.stringify(report, null, 2));
  await rename(`${latest}.${report.runId}.tmp`, latest);
  const fields = [
    'source',
    'sku',
    'name',
    'image_url',
    'old_price',
    'sale_price',
    'currency',
    'product_url',
    'size_price_verified',
  ];
  const csv = [fields, ...report.observations.map((p) => fields.map((f) => p[f] ?? ''))]
    .map((row) => row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(','))
    .join('\n');
  await writeFile(resolve(out, 'observations.csv'), '\uFEFF' + csv);
  console.log(`Отчёт: ${latest}. Опубликовано: 0; неподтверждённые размеры/цены не публикуются.`);
  if (report.reports.some((r) => r.status === 'error')) process.exitCode = 2;
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
