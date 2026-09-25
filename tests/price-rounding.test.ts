import { expect, it } from 'vitest';
import { roundCustomerPrice, sellingPrice, withSellingPrices } from '../src/lib/selling-price';
import { demoProducts } from '../src/lib/demo';
import { addToCart, readCart } from '../src/lib/cart';
import { whatsappOrder } from '../src/lib/whatsapp';
import { filterCatalog } from '../src/lib/catalog';
import { defaultFilters } from '../src/lib/types';

it('всегда округляет вверх и сохраняет уже кратные 500 цены', () => {
  expect([23115, 25533, 23500, 26000, 23000.01].map(roundCustomerPrice)).toEqual([
    23500, 26000, 23500, 26000, 23500,
  ]);
  for (const amount of [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER])
    expect(() => roundCustomerPrice(amount)).toThrow();
  for (let cost = 1; cost <= 100000; cost += 137) {
    const raw = cost < 20000 ? cost + 3000 : cost * 1.12;
    expect(sellingPrice(cost) % 500).toBe(0);
    expect(sellingPrice(cost)).toBeGreaterThanOrEqual(raw - 0.000001);
    expect(sellingPrice(cost) - raw).toBeLessThan(500);
  }
});

it('цена варианта одинаково округлена в каталоге, фильтрах, корзине и заказе', () => {
  const raw = {
    ...demoProducts[0],
    demo: false,
    brand: 'Reebok',
    offerKind: 'retail' as const,
    purchaseType: 'fixed' as const,
    market: 'US' as const,
    warehouseCountry: 'US',
    sizes: ['US M 9', 'US M 10'],
    saleKzt: 20639,
    originalKzt: 30000,
    sizePrices: [
      { size: 'US M 9', salePrice: '40', saleKzt: 20639 },
      { size: 'US M 10', salePrice: '50', saleKzt: 22797 },
    ],
  };
  const priced = withSellingPrices(raw);
  expect(priced.sizePrices?.map((v) => v.saleKzt)).toEqual([23500, 26000]);
  expect(raw.sizePrices[0].saleKzt).toBe(20639);
  expect(priced.sizePrices![0].salePrice).toBe('40');
  expect(priced.originalKzt).toBe(34000);
  expect(filterCatalog([priced], { ...defaultFilters, sizes: ['43'], maxPrice: 25999 }).total).toBe(
    0,
  );
  expect(addToCart([], priced, 'US M 10')[0].saleKzt).toBe(26000);
  const text = new URL(
    whatsappOrder('77079223074', [{ id: priced.id, size: 'US M 10' }], [priced]),
  ).searchParams.get('text')!;
  expect(text).toMatch(/26\s000 ₸/);
  expect(text).not.toContain('25 533');
  const legacy = addToCart([], priced, 'US M 10');
  legacy[0].saleKzt = 25533;
  expect(
    readCart({ getItem: () => JSON.stringify({ version: 1, items: legacy }) })[0].saleKzt,
  ).toBe(26000);
});
