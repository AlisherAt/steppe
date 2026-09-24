import Decimal from 'decimal.js';
export function toKzt(amount: string, rate: string): number {
  const a = new Decimal(amount),
    r = new Decimal(rate);
  if (!a.isFinite() || a.isNegative() || !r.isFinite() || r.lte(0))
    throw new Error('Некорректная цена или курс');
  const value = a.mul(r).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  if (value.gt(Number.MAX_SAFE_INTEGER)) throw new Error('Слишком большая цена');
  return value.toNumber();
}
export function discountPercent(original: string, sale: string): number {
  const o = new Decimal(original),
    s = new Decimal(sale);
  if (!o.isFinite() || !s.isFinite() || o.lte(0) || s.lt(0) || s.gt(o))
    throw new Error('Некорректная скидка');
  return o.minus(s).div(o).mul(100).floor().toNumber();
}
export const formatKzt = (value: number) =>
  new Intl.NumberFormat('ru-KZ', { maximumFractionDigits: 0 }).format(value) + ' ₸';
export const formatRate = (value: string) =>
  new Intl.NumberFormat('ru-KZ', { maximumFractionDigits: 12 }).format(Number(value)) + ' ₸';
export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ru-KZ', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Almaty',
  }).format(new Date(value));
