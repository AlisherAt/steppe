import type { Product } from './types';

// Проверено 25.09.2026. Источники и ограничения: docs/size-guide.md.
// CM — колонка производителя, не результат измерения стопы или стельки.
type Entry = { us: number; eu: number; cm?: number };
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
// Women's Footwear Sizing Guide на официальной странице Princess Reebok UAE.
// CM для 11.5 источник не публикует — оставляем неизвестным.
reebokWomen.push({ us: 11.5, eu: 43 });

// Reebok Australia: Babies / Kids / Youth Footwear. Детские сетки
// выбираются по явно указанной возрастной группе, не по самому номеру US.
const reebokBaby = [
  { us: 0, eu: 15, cm: 6.4 },
  ...chart(1, [
    [16, 6.9],
    [16.5, 7.4],
    [17, 8],
    [18, 8.4],
    [18.5, 9],
    [19, 9.4],
    [19.5, 10],
    [20, 10.4],
    [21, 10.9],
    [21.5, 11.4],
    [22, 12],
    [22.5, 12.5],
    [23.5, 13],
    [24, 13.5],
    [24.5, 14],
    [25, 14.5],
    [25.5, 15],
    [26, 15.5],
    [26.5, 16.1],
  ]),
];
const reebokKids = [
  ...chart(10.5, [
    [27, 16.3],
    [27.5, 16.8],
    [28, 17.3],
    [29, 17.8],
    [30, 18.3],
    [30.5, 18.8],
    [31, 19.3],
  ]),
  ...chart(1, [
    [31.5, 19.8],
    [32, 20.3],
    [32.5, 20.8],
    [33, 21.3],
    [34, 21.8],
    [34.5, 22.4],
    [35, 22.9],
    [36, 23.1],
    [36.5, 23.4],
    [37, 23.9],
    [38, 24.4],
    [38.5, 24.4],
    [39, 24.9],
  ]),
];
const reebokYouth = chart(3, [
  [34, 21.1],
  [34.5, 22.6],
  [35, 23.1],
  [36, 23.6],
  [36.5, 23.9],
  [37, 24.1],
  [38, 24.4],
  [38.5, 24.6],
  [39, 24.9],
]);

export type SizeGuideRow = {
  native: string;
  eu?: number;
  ru?: number;
  us?: string;
  cm?: number;
};
export type SizeContext = Pick<Product, 'brand'> & Partial<Pick<Product, 'gender' | 'name'>>;
type SizingProduct = SizeContext & Pick<Product, 'sizes'>;

export function sizeGuideRows(product: SizingProduct): SizeGuideRow[] {
  return product.sizes.map((native) => {
    const row: SizeGuideRow = { native };
    const value = native.trim().replace(',', '.');
    const euMatch = /^(?:EU\s*)?(\d+(?:\.\d+)?)$/i.exec(value);
    const usMatch = /^US\s+(?:(M|W|K)\s+)?(\d+(?:\.\d+)?)$/i.exec(value);
    if (euMatch) row.eu = Number(euMatch[1]);
    if (usMatch) row.us = value;
    const brand = product.brand.toLowerCase();
    if (product.gender === 'kids' || usMatch?.[1]?.toUpperCase() === 'K') {
      if (brand !== 'reebok' || !usMatch) return row;
      const name = product.name || '';
      const entries = /\b(baby|toddler|infant)\b/i.test(name)
        ? reebokBaby
        : /\b(big kids|youth|grade school)\b/i.test(name)
          ? reebokYouth
          : /\b(little kids|pre[ -]?school)\b/i.test(name)
            ? reebokKids
            : [];
      const entry = entries.find((e) => e.us === Number(usMatch[2]));
      return entry ? { native, eu: entry.eu, us: `US K ${entry.us}`, cm: entry.cm } : row;
    }
    if (brand !== 'puma' && brand !== 'reebok') return row;
    const marker = usMatch?.[1]?.toUpperCase();
    const gender = marker === 'W' ? 'women' : marker === 'M' ? 'men' : product.gender || 'unisex';
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

// Единые подписи и ключи фильтров. Исходные SKU/размеры не изменяются.
export function localSizeKey(product: SizeContext, size: string): string {
  const row = sizeGuideRows({ ...product, sizes: [size] })[0];
  return row.eu === undefined ? size : String(row.eu);
}

export function sizeFilterLabel(key: string): string {
  const eu = /^(?:EU\s*)?(\d+(?:[.,]\d+)?)$/i.exec(key);
  return eu ? `EU ${eu[1].replace('.', ',')}` : key;
}

export function localSizeLabel(product: SizeContext, size: string): string {
  return sizeFilterLabel(localSizeKey(product, size));
}

export function matchesSize(product: SizeContext, native: string, filters: string[]): boolean {
  const key = localSizeKey(product, native);
  return filters.some((filter) => {
    const eu = /^(?:EU\s*)?(\d+(?:[.,]\d+)?)$/i.exec(filter);
    return eu ? key === String(Number(eu[1].replace(',', '.'))) : filter === native;
  });
}
