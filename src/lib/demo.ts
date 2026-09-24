import type { Product } from './types';
import { discountPercent } from './money';
// Демонстрационные цены и иллюстрации. Никогда не записываются в live-таблицы.
const rows = [
  ['Nike', 'Air Max — городской ритм', 74990, 44990, 'men', '1542291026-7eec264c27ff', 'red'],
  [
    'Adidas',
    'Originals — каждый день',
    62990,
    40990,
    'unisex',
    '1600185365483-26d7a4cc7519',
    'cream',
  ],
  ['Nike', 'Court — чистый силуэт', 54990, 32990, 'women', '1549298916-b41d501d3772', 'orange'],
  ['Adidas', 'Runner — лёгкий шаг', 89990, 49490, 'men', '1608231387042-66d1773070a5', 'white'],
  [
    'Nike',
    'Street — новая классика',
    69990,
    48990,
    'unisex',
    '1600269452121-4f2416e55c28',
    'light',
  ],
  ['Adidas', 'Sport — твой темп', 59990, 29990, 'women', '1595950653106-6c9ebd614d3a', 'pink'],
  ['Nike', 'Everyday — без пауз', 79990, 51990, 'men', '1543508282-6319a3e2621f', 'dark'],
  [
    'Adidas',
    'Junior — больше движения',
    39990,
    23990,
    'kids',
    '1518002171953-a080ee817e1f',
    'blue',
  ],
] as const;
export const demoProducts: Product[] = rows.map((r, i) => ({
  id: `demo-${i + 1}`,
  externalId: `demo-${i + 1}`,
  sourceId: r[0].toLowerCase(),
  sourceName: r[0],
  brand: r[0],
  name: r[1],
  imageUrl: `https://images.unsplash.com/photo-${r[5]}?auto=format&fit=crop&w=900&q=85`,
  productUrl: r[0] === 'Nike' ? 'https://www.nike.com/' : 'https://www.adidas.com/',
  sizes:
    i === 7
      ? ['32', '33', '34', '35']
      : i % 2
        ? ['37', '38', '39', '40', '41']
        : ['40', '41', '42', '43', '44'],
  gender: r[4],
  category: i === 3 || i === 5 ? 'Бег' : 'На каждый день',
  originalPrice: String(r[2]),
  salePrice: String(r[3]),
  currency: 'KZT',
  originalKzt: r[2],
  saleKzt: r[3],
  discount: discountPercent(String(r[2]), String(r[3])),
  rate: {
    currency: 'KZT',
    value: '1',
    source: 'Демонстрация — условная цена в тенге',
    asOf: '2026-09-01T00:00:00Z',
    fetchedAt: '2026-09-01T00:00:00Z',
  },
  updatedAt: '2026-09-01T00:00:00Z',
  firstSeenAt: `2026-09-0${8 - i}T00:00:00Z`,
  demo: true,
}));
