import { describe, expect, it } from 'vitest';
import { demoProducts } from '../src/lib/demo';
import type { Product } from '../src/lib/types';
import { addToCart, cartItemKey, changeCartSize, readCart, writeCart } from '../src/lib/cart';
import { FAVORITES_KEY, readFavorites } from '../src/lib/favorites';
import { buildOutfits } from '../src/lib/outfits';
const product: Product = {
  ...demoProducts[0],
  id: 'a'.repeat(64),
  demo: false,
  name: 'Puma Court Classic',
  color: 'PUMA Black',
  gender: 'men',
  department: 'sneakers',
  saleKzt: 15000,
  sizes: ['EU 41', 'EU 42'],
  sizePrices: [
    { size: 'EU 41', salePrice: '20', saleKzt: 15000 },
    { size: 'EU 42', salePrice: '30', saleKzt: 20000 },
  ],
};
const clothes = [
  {
    ...product,
    id: 'b'.repeat(64),
    name: 'Футболка',
    category: 'Футболки и рубашки',
    department: 'casual' as const,
    saleKzt: 10000,
    sizePrices: undefined,
    sizes: ['M'],
  },
  {
    ...product,
    id: 'c'.repeat(64),
    name: 'Брюки',
    category: 'Брюки и джинсы',
    department: 'casual' as const,
    saleKzt: 15000,
    sizePrices: undefined,
    sizes: ['M'],
  },
];
describe('Сохранение выбора и цена размера', () => {
  it('меняет размер, обновляет стоимость и объединяет дубликат', () => {
    const cart = addToCart(addToCart([], product, 'EU 41'), product, 'EU 42');
    const changed = changeCartSize(cart, cartItemKey(cart[0]), product, 'EU 42');
    expect(changed).toHaveLength(1);
    expect(changed[0].saleKzt).toBe(20000);
    let raw = '';
    const storage = {
      setItem: (_: string, value: string) => {
        raw = value;
      },
      getItem: () => raw,
    };
    writeCart(storage, changed);
    expect(readCart(storage)[0].size).toBe('EU 42');
    expect(() => changeCartSize(cart, cartItemKey(cart[0]), product, 'EU 50')).toThrow();
  });
  it('читает избранное без дублей, повреждённых ID и демо', () => {
    expect(
      readFavorites({
        getItem: (key) =>
          key === FAVORITES_KEY
            ? JSON.stringify([product.id, product.id, 'demo-1', '<script>'])
            : null,
      }),
    ).toEqual([product.id]);
    expect(readFavorites({ getItem: () => '{invalid' })).toEqual([]);
  });
});
describe('Образы из реального ассортимента', () => {
  it('содержит обувь, верх и брюки одного взрослого раздела', () => {
    const outfits = buildOutfits([product, ...clothes]);
    expect(outfits.length).toBeGreaterThan(0);
    for (const outfit of outfits) {
      expect(outfit.products).toHaveLength(3);
      expect(outfit.total).toBe(40000);
      expect(outfit.gender).toBe('men');
    }
    expect(outfits.find((o) => o.id === 'men-budget')?.variablePrice).toBe(true);
  });
  it('не обещает бюджет, если отдельный размер делает комплект дороже 50 000', () => {
    const expensive = {
      ...product,
      sizePrices: [{ size: 'EU 41', saleKzt: 40000, salePrice: '40' }],
    };
    expect(buildOutfits([expensive, ...clothes]).some((o) => o.id.endsWith('budget'))).toBe(false);
  });
  it('исключает демо, недоступное, детей и не подменяет брюки аксессуарами', () => {
    expect(buildOutfits([{ ...product, demo: true }, ...clothes])).toEqual([]);
    expect(buildOutfits([{ ...product, sizes: [] }, ...clothes])).toEqual([]);
    expect(buildOutfits([{ ...product, gender: 'kids' }, ...clothes])).toEqual([]);
    expect(
      buildOutfits([product, clothes[0], { ...clothes[1], category: 'Сумки и аксессуары' }]),
    ).toEqual([]);
  });
  it('не угадывает нейтральный цвет по неизвестному названию', () => {
    expect(
      buildOutfits([{ ...product, color: '' }, ...clothes]).some((o) => /base|mono/.test(o.id)),
    ).toBe(false);
  });
  it('исключает детскую и футбольную обувь даже при неверном поле gender', () => {
    for (const name of ['Nike Jr. Court Shoes', 'Puma Court Soccer Shoes']) {
      expect(buildOutfits([{ ...product, gender: 'unisex', name }, ...clothes])).toEqual([]);
    }
  });
});
