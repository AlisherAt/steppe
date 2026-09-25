import type { Product } from './types';

// Проверено 25.09.2026. Источники и ограничения: docs/size-guide.md.
// CM — колонка производителя, не результат измерения стопы или стельки.
type Entry = { us: number; eu: number; cm: number };
function chart(start: number, values: number[][]): Entry[] {
  return values.map(([eu, cm], i) => ({ us: start + i * 0.5, eu, cm }));
}
const pumaMen = chart(4, [
  [36, 22],
  [36.5, 22.5],
  [37, 23],
  [37.5, 23.5],
  [38, 24],
  [38.5, 24.5],
  [39, 25],
  [40, 25.5],
  [40.5, 26],
  [41, 26.5],
  [42, 27],
  [42.5, 27.5],
  [43, 28],
  [44, 28.5],
  [44.5, 29],
  [45, 29.5],
  [46, 30],
  [46.5, 30.5],
  [47, 31],
]);
pumaMen.push(
  { us: 14, eu: 48.5, cm: 31.5 },
  { us: 15, eu: 49.5, cm: 32 },
  { us: 16, eu: 51, cm: 32.5 },
);
const pumaWomen = chart(4, [
  [34, 20.5],
  [34.5, 21],
  [35, 21.5],
  [35.5, 22],
  [36, 22.5],
  [37, 23],
  [37.5, 23.5],
  [38, 24],
  [38.5, 24.5],
  [39, 25],
  [40, 25.5],
  [40.5, 26],
  [41, 26.5],
  [42, 27],
  [42.5, 27.5],
]);
const reebokMen = chart(3.5, [
  [34, 21.5],
  [34.5, 22],
  [35, 22.5],
  [36, 23],
  [36.5, 23.5],
  [37.5, 24],
  [38.5, 24.5],
  [39, 25],
  [40, 25.5],
  [40.5, 26],
  [41, 26.5],
  [42, 27],
  [42.5, 27.5],
  [43, 28],
  [44, 28.5],
  [44.5, 29],
  [45, 29.5],
  [45.5, 30],
  [46, 30.5],
  [47, 31],
  [48, 31.5],
  [48.5, 32],
  [49, 32.5],
  [50, 33],
]);
const reebokWomen = chart(5, [
  [35, 21.5],
  [35.5, 22],
  [36, 22.5],
  [37, 23],
  [37.5, 23.5],
  [38, 24],
  [38.5, 24.5],
  [39, 25],
  [40, 25.5],
  [40.5, 26],
  [41, 26.5],
  [42, 27],
  [42.5, 27.5],
]);
reebokWomen.push({ us: 12, eu: 44, cm: 28.5 });

export type SizeGuideRow = {
  native: string;
  eu?: number;
  ru?: number;
  us?: string;
  cm?: number;
};
type SizingProduct = Pick<Product, 'brand' | 'gender' | 'sizes'>;

export function sizeGuideRows(product: SizingProduct): SizeGuideRow[] {
  return product.sizes.map((native) => {
    const row: SizeGuideRow = { native };
    const value = native.trim().replace(',', '.');
    const euMatch = /^(?:EU\s*)?(\d+(?:\.\d+)?)$/i.exec(value);
    const usMatch = /^US\s+(?:(M|W|K)\s+)?(\d+(?:\.\d+)?)$/i.exec(value);
    if (euMatch) row.eu = Number(euMatch[1]);
    if (usMatch) row.us = value;
    // Детские US повторяются у малышей и подростков. Без отдельной
    // подтверждённой сетки модели их нельзя переводить по взрослой таблице.
    if (product.gender === 'kids' || usMatch?.[1]?.toUpperCase() === 'K') return row;
    const brand = product.brand.toLowerCase();
    if (brand !== 'puma' && brand !== 'reebok') return row;
    const marker = usMatch?.[1]?.toUpperCase();
    const gender = marker === 'W' ? 'women' : marker === 'M' ? 'men' : product.gender;
    // Голый US у унисекс не определяет мужскую/женскую систему.
    if (usMatch && gender === 'unisex') return row;
    const women = gender === 'women';
    const entries =
      brand === 'puma' ? (women ? pumaWomen : pumaMen) : women ? reebokWomen : reebokMen;
    const entry = entries.find((e) =>
      euMatch ? e.eu === row.eu : usMatch ? e.us === Number(usMatch[2]) : false,
    );
    if (!entry) return row;
    return {
      native,
      eu: entry.eu,
      ru: entry.eu - 1,
      cm: entry.cm,
      us: `US ${women ? 'W' : 'M'} ${entry.us}`,
    };
  });
}
