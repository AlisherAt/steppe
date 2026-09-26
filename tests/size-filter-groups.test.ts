import { expect, it } from 'vitest';
import { facetsFor } from '../src/lib/catalog';
import { demoProducts } from '../src/lib/demo';

it('группирует размеры по категории товара, сохраняя общие размеры в обеих группах', () => {
  const base = demoProducts[0];
  const facets = facetsFor([
    { ...base, gender: 'women', sizes: ['EU 35', 'EU 39'] },
    { ...base, gender: 'kids', sizes: ['EU 20', 'EU 35', 'EU 39'] },
    { ...base, gender: 'unisex', sizes: ['EU 42.5'] },
  ]);
  expect(facets.sizes).toEqual(['20', '35', '39', '42.5']);
  expect(facets.sizeGroups).toEqual({ adults: ['35', '39', '42.5'], kids: ['20', '35', '39'] });
});
