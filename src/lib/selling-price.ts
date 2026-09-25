import Decimal from 'decimal.js';
import type { Product } from './types';

export function sellingPrice(costKzt: number): number {
  if (!Number.isSafeInteger(costKzt) || costKzt <= 0) throw Error('INVALID_COST');
  const cost = new Decimal(costKzt);
  const result = (cost.lt(20000) ? cost.plus(3000) : cost.mul('1.12')).toDecimalPlaces(
    0,
    Decimal.ROUND_HALF_UP,
  );
  if (result.gt(Number.MAX_SAFE_INTEGER)) throw Error('INVALID_COST');
  return result.toNumber();
}

export function withSellingPrices(p: Product): Product {
  if (p.demo) return p;
  const sizePrices = p.sizePrices?.map((v) => ({ ...v, saleKzt: sellingPrice(v.saleKzt) }));
  const saleKzt = sizePrices?.length
    ? Math.min(...sizePrices.map((v) => v.saleKzt))
    : sellingPrice(p.saleKzt);
  // Показываем только скидку относительно сопоставимой цены с той же наценкой.
  const old = p.originalKzt === null ? null : sellingPrice(p.originalKzt);
  const originalKzt = old !== null && old > saleKzt ? old : null;
  return {
    ...p,
    sizePrices,
    saleKzt,
    originalKzt,
    discount: originalKzt
      ? new Decimal(originalKzt).minus(saleKzt).div(originalKzt).mul(100).floor().toNumber()
      : 0,
  };
}
