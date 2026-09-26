import Decimal from 'decimal.js';
import type { Product } from './types';
import { withSellingPrices } from './selling-price';

// Диапазоны по итоговой минимальной цене карточки, с наценкой и округлением.
export const nikePriceBands = [
  { label: 'До 15 000 ₸', min: 0, max: 15000 },
  { label: '15 001–25 000 ₸', min: 15000, max: 25000 },
  { label: '25 001–35 000 ₸', min: 25000, max: 35000 },
  { label: '35 001–50 000 ₸', min: 35000, max: 50000 },
  { label: 'Выше 50 000 ₸', min: 50000, max: Infinity },
];

export function selectNikeDeals(input: Product[], perBand = 100) {
  if (!Number.isInteger(perBand) || perBand < 1 || perBand > 100) throw Error('INVALID_LIMIT');
  const unique = new Map<string, Product>();
  for (const p of input) {
    if (
      p.brand !== 'Nike' ||
      p.demo ||
      p.purchaseType !== 'fixed' ||
      !p.sizes.length ||
      !p.originalPrice ||
      !new Decimal(p.originalPrice).gt(p.salePrice)
    )
      continue;
    const previous = unique.get(p.id);
    if (!previous || p.sourceUpdatedAt! > previous.sourceUpdatedAt!) unique.set(p.id, p);
  }
  const rows = [...unique.values()].map((p) => ({
    product: p,
    price: withSellingPrices(p).saleKzt,
    saving: new Decimal(p.originalPrice!).minus(p.salePrice).div(p.originalPrice!),
  }));
  const groups = nikePriceBands.map((band) => {
    const candidates = rows.filter((r) => r.price > band.min && r.price <= band.max);
    candidates.sort(
      (a, b) =>
        b.saving.comparedTo(a.saving) ||
        a.price - b.price ||
        b.product.sizes.length - a.product.sizes.length ||
        a.product.id.localeCompare(b.product.id),
    );
    return { band, candidates, count: Math.min(perBand, candidates.length) };
  });
  // Свободные места распределяем поровну по непустым диапазонам.
  // Внутри каждого диапазона всегда берём следующую наибольшую скидку.
  let remaining =
    Math.min(rows.length, perBand * groups.length) - groups.reduce((n, g) => n + g.count, 0);
  while (remaining > 0) {
    const eligible = groups.filter((g) => g.count < g.candidates.length);
    if (!eligible.length) break;
    eligible.sort(
      (a, b) =>
        a.count - b.count || b.candidates[b.count].saving.comparedTo(a.candidates[a.count].saving),
    );
    eligible[0].count++;
    remaining--;
  }
  const products = groups.flatMap((g) => g.candidates.slice(0, g.count).map((r) => r.product));
  const bands = groups.map((g) => ({
    label: g.band.label,
    available: g.candidates.length,
    selected: g.count,
    target: perBand,
  }));
  return { products, bands };
}
