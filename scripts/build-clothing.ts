import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { clothingProduct, type ClothingSource } from '../src/lib/server/clothing';
import { clothingSources } from './clothing/products.mjs';
import { loadRates } from '../src/lib/server/rates';
import { offerVisible } from '../src/lib/promotion';
import { isAllowedUniqloProduct } from '../src/lib/uniqlo-labels.mjs';
import type { Product } from '../src/lib/types';
async function main() {
  const file = process.argv[2],
    out = process.argv[3] || 'artifacts/publish-clothing';
  if (!file) throw Error('REPORT_REQUIRED');
  const report = JSON.parse(await readFile(file, 'utf8'));
  const key = report.source as ClothingSource;
  if (
    !Object.hasOwn(clothingSources, key) ||
    report.version !== 1 ||
    !Array.isArray(report.products) ||
    report.products.length > 10000
  )
    throw Error('INVALID_CLOTHING_REPORT');
  if (report.status === 'error') throw Error(report.error || 'SOURCE_FAILED');
  const source = clothingSources[key],
    filename = `clothing-${source.id}.json`;
  const rates = await loadRates();
  let previous: { products: Product[]; checkedAt: string | null } = {
    products: [],
    checkedAt: null,
  };
  try {
    previous = JSON.parse(await readFile(`data/catalog/${filename}`, 'utf8'));
  } catch {}
  const products = new Map<string, Product>();
  // Неполный обход не удаляет недавно проверенные товары; срок их проверки не продлевается.
  if (!report.complete)
    for (const p of previous.products)
      if (offerVisible(p) && isAllowedUniqloProduct(p)) products.set(p.id, p);
  let accepted = 0,
    rejected = 0;
  for (const raw of report.products) {
    try {
      const p = clothingProduct(raw, key, rates);
      p.firstSeenAt = previous.products.find((v) => v.id === p.id)?.firstSeenAt || p.firstSeenAt;
      products.set(p.id, p);
      accepted++;
    } catch (e) {
      rejected++;
      console.error(
        JSON.stringify({
          source: key,
          sku: raw.sku,
          error: e instanceof Error ? e.message.slice(0, 100) : 'INVALID_PRODUCT',
        }),
      );
    }
  }
  if (!accepted && (!report.complete || rejected)) throw Error('NO_VERIFIED_CLOTHING');
  const snapshot = {
    version: 1,
    sourceId: source.id,
    sourceName: `${source.brand} ${source.market}`,
    department: source.department,
    generatedAt: new Date().toISOString(),
    checkedAt: report.finishedAt || report.checkedAt,
    runId: report.runId,
    collectionStatus: report.complete && !rejected ? 'complete' : 'partial',
    complete: report.complete && !rejected,
    products: [...products.values()],
  };
  await mkdir(out, { recursive: true });
  await writeFile(`${out}/${filename}`, JSON.stringify(snapshot) + '\n');
  console.log(
    JSON.stringify({
      source: key,
      accepted,
      rejected,
      total: products.size,
      complete: snapshot.complete,
    }),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
