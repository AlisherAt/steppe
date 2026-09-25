import Decimal from 'decimal.js';
import type { Product } from './types';

export const CUSTOMER_PRICE_STEP = 500;

// Округляем уже рассчитанную цену, без повторного начисления наценки.
export function roundCustomerPrice(amount: number | Decimal): number {
  const price = new Decimal(amount);
  if (!price.isFinite() || price.lte(0)) throw Error('INVALID_COST');
  const rounded = price.div(CUSTOMER_PRICE_STEP).ceil().mul(CUSTOMER_PRICE_STEP);
  if (rounded.gt(Number.MAX_SAFE_INTEGER)) throw Error('INVALID_COST');
  return rounded.toNumber();
}

export function sellingPrice(costKzt: number): number {
  if (!Number.isSafeInteger(costKzt) || costKzt <= 0) throw Error('INVALID_COST');
  const cost = new Decimal(costKzt);
  return roundCustomerPrice(cost.lt(20000) ? cost.plus(3000) : cost.mul('1.12'));
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
