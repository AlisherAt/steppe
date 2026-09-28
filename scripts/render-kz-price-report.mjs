// Создаёт автономный HTML из проверенного снимка; не делает новых запросов цен.
import { readFile, writeFile, readdir } from 'node:fs/promises';
const report = JSON.parse(
  await readFile('docs/research/kz-price-comparison-2026-09-28.json', 'utf8'),
);
const images = new Map();
for (const file of await readdir('data/catalog')) {
  if (!file.endsWith('.json')) continue;
  const snapshot = JSON.parse(await readFile('data/catalog/' + file, 'utf8'));
  for (const p of snapshot.products || [])
    if (p.imageUrl?.startsWith('https://')) images.set(p.id, p.imageUrl);
}
const data = {
  ...report,
  rows: report.rows.map((r) => ({ ...r, imageUrl: images.get(r.productId) || null })),
};
const template = await readFile('scripts/reports/kz-review.template.html', 'utf8');
const json = JSON.stringify(data)
  .replaceAll('<', '\\u003c')
  .replaceAll('\u2028', '\\u2028')
  .replaceAll('\u2029', '\\u2029');
const output = 'docs/research/steppe-price-review.html';
await writeFile(output, template.replace('__REPORT_DATA__', json));
console.log(
  JSON.stringify({
    output,
    rows: data.rows.length,
    images: data.rows.filter((r) => r.imageUrl).length,
  }),
);
