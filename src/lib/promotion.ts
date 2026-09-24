import type { Product } from './types';

// A sale end is supplied by the source, never inferred from its brand or discount.
export const MAX_PROMOTION_CACHE_MS = 31 * 86400000;
export function offerMaxAgeMs() {
  const hours = Number(process.env.OFFER_MAX_AGE_HOURS || 36);
  return (Number.isFinite(hours) ? Math.min(168, Math.max(1, hours)) : 36) * 3600000;
}
export function promotionDeadline(p: Pick<Product, 'saleEndsAt' | 'updatedAt'>): number | null {
  const end = Date.parse(p.saleEndsAt || '');
  const checked = Date.parse(p.updatedAt);
  return Number.isFinite(end) && Number.isFinite(checked) && end > checked
    ? Math.min(end, checked + MAX_PROMOTION_CACHE_MS)
    : null;
}
export function nextPromotionRefresh(products: Product[], now = Date.now()): string | null {
  if (!products.length) return null;
  const deadlines = products.map(promotionDeadline);
  if (deadlines.some((d) => d === null || d <= now)) return null;
  return new Date(Math.min(...(deadlines as number[]))).toISOString();
}
export function offerVisible(p: Product, now = Date.now(), maxAge = offerMaxAgeMs()): boolean {
  const checked = Date.parse(p.updatedAt);
  if (
    p.sourceUpdatedAt &&
    (now - Date.parse(p.sourceUpdatedAt) > maxAge ||
      !Number.isFinite(Date.parse(p.sourceUpdatedAt)))
  )
    return false;
  if (!Number.isFinite(checked) || checked > now + 3600000) return false;
  if (p.saleStartsAt && !(Date.parse(p.saleStartsAt) <= now)) return false;
  if (p.saleEndsAt && !(Date.parse(p.saleEndsAt) > now)) return false;
  return now - checked <= maxAge || (promotionDeadline(p) ?? 0) > now;
}
