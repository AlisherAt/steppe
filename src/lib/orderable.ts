import type { Product } from './types';
import { officialStores } from './official-stores';
export const EUROPE_COUNTRIES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'GB',
  'CH',
  'NO',
  'IS',
  'LI',
];
export function orderableProduct(p: Product) {
  return (
    p.offerKind === 'retail' &&
    p.purchaseType === 'fixed' &&
    (p.market === 'US'
      ? p.warehouseCountry === 'US' ||
        p.sourceId === 'manual-us' ||
        (p.sourceId.endsWith('-us') && Object.hasOwn(officialStores, p.sourceId))
      : p.market === 'EU' &&
        (EUROPE_COUNTRIES.includes(p.warehouseCountry || '') ||
          p.sourceId === 'manual-eu' ||
          (p.sourceId.endsWith('-eu') && Object.hasOwn(officialStores, p.sourceId)))) &&
    !!p.sizePrices?.length &&
    p.sizes.length === p.sizePrices.length &&
    new Set(p.sizePrices.map((v) => v.size)).size === p.sizePrices.length &&
    p.sizes.every((s) =>
      p.sizePrices!.some((v) => v.size === s && v.saleKzt > 0 && Number(v.salePrice) > 0),
    )
  );
}
