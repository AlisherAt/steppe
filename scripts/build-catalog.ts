import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { scrapeReportSchema } from '../src/lib/server/scrape-report';
import { retailScrapeProduct } from '../src/lib/server/scraped-retail';
import { pumaFeedProduct } from '../src/lib/server/puma';
import { toProduct } from '../src/lib/server/adapters';
import { loadRates } from '../src/lib/server/rates';
import { selectNikeDeals } from '../src/lib/nike-selection';
import { orderableProduct } from '../src/lib/orderable';

async function main() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--out');
  const output = outputIndex < 0 ? 'data/catalog' : args.splice(outputIndex, 2)[1];
  if (!args.length) throw Error('Укажите путь к отчёту сборщика.');
  const rates = await loadRates();
  await mkdir(output, { recursive: true });
  let saved = 0;
  for (const path of args) {
    const report = scrapeReportSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    for (const source of ['nike', 'puma', 'reebok']) {
      const status = report.reports.find((r) => r.source === source);
      if (!status || !['finished_observed_pages', 'partial', 'time_limit'].includes(status.status))
        continue;
      const adapter = {
        id: `${source}-us`,
        name: `${source === 'nike' ? 'Nike' : source === 'puma' ? 'Puma' : 'Reebok'} US`,
      };
      const normalized = report.products
        .filter((p) => p.source === source)
        .flatMap((raw) => {
          const feed = source === 'puma' ? pumaFeedProduct(raw) : retailScrapeProduct(raw);
          if (!feed) return [];
          const p = toProduct(feed, adapter, rates);
          // Время сбора не заменяем временем повторной публикации.
          p.updatedAt = p.sourceUpdatedAt!;
          p.firstSeenAt = p.sourceUpdatedAt!;
          return orderableProduct(p) ? [p] : [];
        });
      const selection =
        source === 'nike'
          ? selectNikeDeals(normalized)
          : { products: [...new Map(normalized.map((p) => [p.id, p])).values()] };
      if (!selection.products.length) continue; // Ошибка/пустой отчёт не стирает последний успешный снимок.
      const snapshot = {
        version: 1,
        sourceId: adapter.id,
        sourceName: adapter.name,
        generatedAt: new Date().toISOString(),
        checkedAt: new Date(
          Math.min(...selection.products.map((p) => Date.parse(p.sourceUpdatedAt!))),
        ).toISOString(),
        runId: report.runId,
        collectionStatus: status.status,
        ...selection,
      };
      await writeFile(resolve(output, `${adapter.id}.json`), JSON.stringify(snapshot) + '\n');
      saved++;
      console.log(
        JSON.stringify({
          source: source,
          count: selection.products.length,
          ...('bands' in selection ? { bands: selection.bands } : {}),
        }),
      );
    }
  }
  if (!saved) throw Error('NO_FRESH_VERIFIED_PRODUCTS');
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
