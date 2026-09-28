import { readFile, writeFile } from 'node:fs/promises';
import { uniqloName } from '../src/lib/uniqlo-labels.mjs';
import { procurementArchive } from './procurement-archive.mjs';

// Повторяемая миграция сохранённых карточек. Цены и время их проверки не меняются.
for (const region of ['jp', 'kr']) {
  const file = `data/catalog/clothing-uniqlo-${region}.json`;
  const snapshot = JSON.parse(await readFile(file, 'utf8'));
  const excluded = { excluded: 0, unknown: 0 };
  let renamed = 0;
  const products = snapshot.products.flatMap((product) => {
    const length = product.sku?.match(/-\d{2}-\d{2}-(.+)$/)?.[1];
    const label = uniqloName(
      product.usage || '',
      '',
      length === 'standard' ? '' : length,
      product.sku,
    );
    if (!label.allowed) {
      excluded[label.reason]++;
      return [];
    }
    if (product.name !== label.name || product.category !== label.category) renamed++;
    return [{ ...product, name: label.name, category: label.category }];
  });
  // Старые заказы остаются доступны администратору, но не возвращаются в витрину.
  const archivedProducts = procurementArchive(snapshot, products);
  await writeFile(file, JSON.stringify({ ...snapshot, products, archivedProducts }) + '\n');
  console.log(
    JSON.stringify({
      region,
      before: snapshot.products.length,
      after: products.length,
      renamed,
      ...excluded,
    }),
  );
}
