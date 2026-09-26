import { expect, it } from 'vitest';
import { selectNikeDeals } from '../src/lib/nike-selection';
import { sellingPrice } from '../src/lib/selling-price';
import { demoProducts } from '../src/lib/demo';
import type { Product } from '../src/lib/types';

const costs = [10000, 20000, 28000, 40000, 60000];
function products(counts: number[]): Product[] {
  return counts.flatMap((count, band) =>
    Array.from({ length: count }, (_, index) => ({
      ...demoProducts[0],
      id: `${band}-${index}`,
      brand: 'Nike',
      demo: false,
      purchaseType: 'fixed' as const,
      saleKzt: costs[band],
      sizePrices: undefined,
      originalPrice: '1000',
      salePrice: String(100 + index),
      sizes: ['EU 42'],
    })),
  );
}
it('переносит 95 свободных мест в другие диапазоны и сохраняет лучшие относительные скидки', () => {
  const selected = selectNikeDeals(products([5, 250, 250, 250, 250]));
  expect(selected.products).toHaveLength(500);
  expect(selected.bands.map((b) => b.selected)).toEqual([5, 124, 124, 124, 123]);
  expect(selected.products.some((p) => p.id === '1-124')).toBe(false);
  expect(new Set(selected.products.map((p) => p.id)).size).toBe(500);
});
it('не выдумывает товары при нехватке предложений и не добавляет дубликаты', () => {
  const input = products([0, 5, 8, 10, 0]);
  const selected = selectNikeDeals([...input, ...input]);
  expect(selected.products).toHaveLength(23);
  expect(selected.bands.map((b) => b.selected)).toEqual([0, 5, 8, 10, 0]);
});
it('распределяет 100 недостающих мест поровну между четырьмя диапазонами', () => {
  expect(selectNikeDeals(products([0, 200, 200, 200, 200])).bands.map((b) => b.selected)).toEqual([
    0, 125, 125, 125, 125,
  ]);
});
it('учитывает наценку 15%, округление, границы диапазонов и цены вариантов', () => {
  const costs = [12000, 21739, 30434, 43478, 43479];
  expect(costs.map(sellingPrice)).toEqual([15000, 25000, 35000, 50000, 50500]);
  const input = products([1, 1, 1, 1, 1]).map((p, i) => ({
    ...p,
    saleKzt: 999999,
    sizePrices: [{ size: 'EU 42', salePrice: p.salePrice, saleKzt: costs[i] }],
  }));
  expect(selectNikeDeals(input).bands.map((b) => b.selected)).toEqual([1, 1, 1, 1, 1]);
});
