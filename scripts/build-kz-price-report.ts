import fs from 'node:fs';
import assert from 'node:assert/strict';
import { sellingPrice } from '../src/lib/selling-price';
import { localSizeKey } from '../src/lib/size-guide';
import { offerVisible } from '../src/lib/promotion';
import type { Product } from '../src/lib/types';

type Evidence = {
  department: string;
  ours: Product;
  match: string;
  note: string;
  kz: {
    store: string;
    sku: string;
    name: string;
    url: string;
    price: number;
    sizes: string[];
    available: boolean;
    verifiedOnProductPage: boolean;
    observedAt: string;
    sizePrices?: { size: string; price: number }[];
    sizeVerification?: string;
  };
};
const source = 'docs/research/kz-price-evidence-2026-09-28.json';
const evidence = JSON.parse(fs.readFileSync(source, 'utf8')) as {
  checkedDate: string;
  selection: string;
  rows: Evidence[];
};
const normalizedSize = (size: string) =>
  size
    .replace(/^EU\s*/i, '')
    .replace(',', '.')
    .replace('XXL', '2XL')
    .trim();
const observed = Math.max(...evidence.rows.map((r) => Date.parse(r.kz.observedAt)));
assert.equal(evidence.rows.length, 130);
assert.equal(new Set(evidence.rows.map((x) => x.ours.id)).size, 130);
assert.equal(
  new Set(
    evidence.rows.map(
      (x) =>
        x.ours.brand +
        (x.ours.brand === 'Uniqlo' ? x.ours.usage! : x.ours.name)
          .toLowerCase()
          .replace(/\s+/g, ' '),
    ),
  ).size,
  130,
);
const rows = evidence.rows.map((r, i) => {
  const p = r.ours,
    k = r.kz;
  assert(p.sku, 'Отсутствует артикул STEPPE');
  assert(offerVisible(p, observed), 'Устаревший товар STEPPE: ' + p.sku);
  assert(
    k.available && k.verifiedOnProductPage && k.sizes.length,
    'Не подтверждена карточка: ' + k.url,
  );
  assert(k.price > 1 && Number.isFinite(k.price));
  if (r.match !== 'analogue')
    assert.equal(p.sku.replace('_', '-').split('-')[0], k.sku.replace('_', '-').split('-')[0]);
  const shared = p.sizes.filter((s) =>
    k.sizes.some((v) => normalizedSize(v) === normalizedSize(localSizeKey(p, s))),
  );
  const selected = shared[0] || p.sizes[0];
  const size = normalizedSize(localSizeKey(p, selected));
  const cost = p.sizePrices?.find((s) => s.size === selected)?.saleKzt ?? p.saleKzt;
  const price = sellingPrice(cost);
  const kzPrice =
    (shared.length
      ? k.sizePrices?.find((s) => normalizedSize(s.size) === size)?.price
      : undefined) || k.price;
  const difference = kzPrice - price;
  const verifiedSameSize = shared.length > 0 && k.store !== 'Japan Style';
  const strict = r.match === 'exact' && verifiedSameSize;
  return {
    number: i + 1,
    department: r.department,
    brand: p.brand,
    name: p.brand === 'Uniqlo' ? 'Uniqlo ' + r.note.split(':')[0] : p.name,
    category: p.category,
    sku: p.sku,
    color: p.color,
    productId: p.id,
    sourceUrl: p.productUrl,
    steppeUrl:
      'https://steppe-gray.vercel.app/?mode=live&department=' +
      (p.department || 'sneakers') +
      '&q=' +
      encodeURIComponent(p.sku),
    selectedSize: size,
    nativeSize: selected,
    costKzt: cost,
    steppePrice: price,
    steppeCheckedAt: p.sourceUpdatedAt || p.updatedAt,
    originalCurrency: p.currency,
    originalSalePrice: p.salePrice,
    kzName: k.name,
    kzSku: k.sku,
    kzStore: k.store,
    kzUrl: k.url,
    kzPrice,
    kzCheckedAt: k.observedAt,
    kzSizes: k.sizes,
    steppeSizes: p.sizes.map((s) => normalizedSize(localSizeKey(p, s))),
    sharedSizes: shared.map((s) => normalizedSize(localSizeKey(p, s))),
    verifiedSameSize,
    strict,
    match: r.match,
    note: r.note,
    sizeNote:
      k.sizeVerification ||
      (shared.length
        ? 'Размер есть в обеих карточках; посадка и региональные размерные сетки отдельно не проверялись.'
        : 'Общего доступного размера не найдено. Это сравнение цен карточек, а не готовых альтернатив для одного покупателя.'),
    difference,
    differencePercent: Math.round((difference / kzPrice) * 1000) / 10,
  };
});
function stats(items: typeof rows) {
  const sorted = items.map((x) => x.differencePercent).sort((a, b) => a - b);
  const median = sorted.length
    ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2
    : null;
  return {
    count: items.length,
    cheaper: items.filter((x) => x.difference > 0).length,
    dearer: items.filter((x) => x.difference < 0).length,
    equal: items.filter((x) => x.difference === 0).length,
    medianPercent: median === null ? null : Math.round(median * 10) / 10,
    minDifference: items.length ? Math.min(...items.map((x) => x.difference)) : null,
    maxDifference: items.length ? Math.max(...items.map((x) => x.difference)) : null,
  };
}
const summary = {
  all: stats(rows),
  sneakers: stats(rows.filter((x) => x.department === 'sneakers')),
  clothing: stats(rows.filter((x) => x.department === 'clothing')),
  exactSameSize: stats(rows.filter((x) => x.strict)),
  sameBaseDifferentColor: stats(rows.filter((x) => x.match === 'color' && x.verifiedSameSize)),
  analogues: stats(rows.filter((x) => x.match === 'analogue')),
  noConfirmedSharedSize: stats(rows.filter((x) => !x.verifiedSameSize)),
  brands: Object.fromEntries(
    [...new Set(rows.map((x) => x.brand))].map((brand) => [
      brand,
      stats(rows.filter((x) => x.brand === brand)),
    ]),
  ),
};
assert.equal(summary.sneakers.count, 50);
assert.equal(summary.clothing.count, 80);
const report = {
  checkedDate: evidence.checkedDate,
  generatedAt: new Date().toISOString(),
  currency: 'KZT',
  selection: evidence.selection,
  formula:
    'Стоимость источника < 20 000 ₸: (стоимость + 3 000) × 1,03; от 20 000 ₸: стоимость × 1,15 × 1,03. Один раз округлить вверх до 500 ₸.',
  differenceDefinition:
    'Цена KZ минус новая цена STEPPE; процент делится на текущую цену KZ. Положительное число — STEPPE дешевле.',
  limitations: [
    'Срез открытых карточек за 28.09.2026. Цены и остатки меняются; повторная проверка нужна перед заказом.',
    'Сравнивается цена товара без доставки, дополнительных сборов, промокодов, кешбэка и условий рассрочки. Полная стоимость заказа может отличаться.',
    'Это выборка доступных совпадений, а не средняя цена Казахстана и не поиск гарантированно самого дешёвого продавца.',
    '74 из 80 вещей — Puma, 6 — Uniqlo. Результат нельзя переносить на весь раздел одежды Nike, Reebok и Uniqlo.',
    'Разные расцветки, выпуски, материалы, ширина и региональные размеры не считаются идентичными товарами. Аналоги вынесены отдельно.',
    'Мужские и женские версии, а также отдельные специальные выпуски считаются разными моделями; простые дубликаты расцветок не включались.',
    'Нет общего подтверждённого размера — нет утверждения о доступной экономии для одного и того же размера.',
    'Начисление +3% выполнено по указанию владельца после наценки. Это правило цены, а не заключение о налоговом обязательстве.',
  ],
  summary,
  rows,
};
fs.writeFileSync(
  'docs/research/kz-price-comparison-2026-09-28.json',
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
