import { expect, it } from 'vitest';
import { demoProducts } from '../src/lib/demo';
import { defaultFilters } from '../src/lib/types';
import { facetsFor, filterCatalog } from '../src/lib/catalog';
import { addToCart, readCart, writeCart } from '../src/lib/cart';
import { localSizeLabel } from '../src/lib/size-guide';
import { whatsappOrder } from '../src/lib/whatsapp';

const p = {
  ...demoProducts[0],
  brand: 'Reebok',
  gender: 'kids' as const,
  name: 'Club C Double Shoes - Big Kids',
  demo: false,
  offerKind: 'retail' as const,
  purchaseType: 'fixed' as const,
  market: 'US' as const,
  warehouseCountry: 'US',
  sizes: ['US K 3.5', 'US K 5'],
  sizePrices: [
    { size: 'US K 3.5', salePrice: '40', saleKzt: 23000 },
    { size: 'US K 5', salePrice: '60', saleKzt: 34000 },
  ],
};

it('фильтр EU находит исходный US и цену именно выбранного варианта', () => {
  expect(facetsFor([p]).sizes).toEqual(['34.5', '36.5']);
  expect(filterCatalog([p], { ...defaultFilters, sizes: ['36.5'], maxPrice: 30000 }).total).toBe(0);
  const result = filterCatalog([p], { ...defaultFilters, sizes: ['EU 36.5'] });
  expect(result.total).toBe(1);
  expect(result.products[0].saleKzt).toBe(34000);
  expect(result.products[0].sizes).toEqual(p.sizes);
  expect(filterCatalog([p], { ...defaultFilters, sizes: ['US K 5'] }).total).toBe(1);
});

it('корзина сохраняет US для выкупа, а показывает EU даже после перезагрузки', () => {
  let value = '';
  const storage = {
    getItem: () => value,
    setItem: (_: string, v: string) => {
      value = v;
    },
  };
  writeCart(storage, addToCart([], p, 'US K 5'));
  const item = readCart(storage)[0];
  expect(item.size).toBe('US K 5');
  expect(item.saleKzt).toBe(34000);
  expect(localSizeLabel(item, item.size)).toBe('EU 36,5');
  // Существующие корзины v1 без gender остаются читаемыми.
  delete item.gender;
  writeCart(storage, [item]);
  expect(localSizeLabel(readCart(storage)[0], item.size)).toBe('EU 36,5');
  const text = new URL(
    whatsappOrder('77079223074', [{ id: p.id, size: item.size }], [p]),
  ).searchParams.get('text')!;
  expect(text).toContain('Размер: EU 36,5');
  expect(text).toContain('Размер для выкупа: US K 5');
  expect(text).toMatch(/34\s000 ₸/);
});

it('общий EU объединяет Puma и Reebok без смешивания мужских и женских US', () => {
  const men = { ...p, gender: 'men' as const, sizes: ['US M 9'], sizePrices: undefined };
  const women = { ...men, gender: 'women' as const, sizes: ['US W 9'] };
  const puma = { ...men, brand: 'Puma', sizes: ['42'] };
  expect(facetsFor([men, women, puma]).sizes).toEqual(['40', '42']);
  expect(filterCatalog([men, women, puma], { ...defaultFilters, sizes: ['42'] }).total).toBe(2);
});
