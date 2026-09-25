import { describe, expect, it } from 'vitest';
import { whatsappOrder, whatsappPhone } from '../src/lib/whatsapp';
import { demoProducts } from '../src/lib/demo';
import { orderPhone, orderPhoneLabel } from '../src/lib/store-contact';
const product = {
  ...demoProducts[0],
  id: 'a'.repeat(64),
  demo: false,
  offerKind: 'retail' as const,
  purchaseType: 'fixed' as const,
  warehouseCountry: 'US',
  market: 'US' as const,
  sizes: ['42'],
  sizePrices: [{ size: '42', salePrice: '80', saleKzt: 40000 }],
  saleKzt: 40000,
  name: 'Модель & Special',
  productUrl: 'https://stockx.com/example?a=1&b=2',
};
const selection = [{ id: product.id, size: '42' }];
describe('WhatsApp orders', () => {
  it('отправляет полный заказ на номер STEPPE с ценой каждого размера и общей суммой', () => {
    const second = {
      ...product,
      id: 'b'.repeat(64),
      brand: 'Reebok',
      name: 'Вторая пара',
      sizes: ['US W 7'],
      sizePrices: [{ size: 'US W 7', salePrice: '50', saleKzt: 27000 }],
    };
    const url = new URL(
      whatsappOrder(
        orderPhone,
        [...selection, { id: second.id, size: 'US W 7' }],
        [product, second],
      ),
    );
    expect(url.pathname).toBe('/77079223074');
    expect(whatsappPhone(orderPhoneLabel)).toBe(orderPhone);
    const text = url.searchParams.get('text')!;
    expect(text).toContain('Модель & Special');
    expect(text).toContain('2. Reebok — Вторая пара');
    expect(text).toContain('EU 42');
    expect(text).toContain('US W 7');
    expect(text).toContain('Всего пар: 2');
    expect(text).toMatch(/40\s000 ₸/);
    expect(text).toMatch(/27\s000 ₸/);
    expect(text).toMatch(/67\s000 ₸/);
  });
  it('validates international phone numbers', () => {
    expect(whatsappPhone('+7 (700) 123-45-67')).toBe('77001234567');
    for (const value of ['', '123', '07001234567', 'https://example.com', '7abc7001234567'])
      expect(whatsappPhone(value)).toBeNull();
  });
  it('encodes the full list, sizes, links and KZT total', () => {
    const url = new URL(whatsappOrder('77001234567', selection, [product]));
    expect(url.origin).toBe('https://wa.me');
    expect(url.pathname).toBe('/77001234567');
    const text = url.searchParams.get('text')!;
    expect(text).toContain('1.');
    expect(text).toContain('Модель & Special');
    expect(text).toContain('EU 42');
    expect(text).not.toContain(product.productUrl);
    expect(text).toContain(product.id);
    expect(text).toContain('Всего пар: 1');
    expect(text).toContain('₸');
  });
  it('rejects demo, missing items, unavailable sizes, duplicates and empty carts', () => {
    expect(() => whatsappOrder('77001234567', selection, [{ ...product, demo: true }])).toThrow();
    expect(() => whatsappOrder('77001234567', selection, [])).toThrow();
    expect(() =>
      whatsappOrder('77001234567', [{ ...selection[0], size: '43' }], [product]),
    ).toThrow();
    expect(() => whatsappOrder('77001234567', [...selection, ...selection], [product])).toThrow();
    expect(() => whatsappOrder('77001234567', [], [product])).toThrow();
  });
  it('never truncates an oversized order', () => {
    const products = Array.from({ length: 50 }, (_, i) => ({
      ...product,
      id: String(i),
      name: 'Я'.repeat(180),
    }));
    expect(() =>
      whatsappOrder(
        '77001234567',
        products.map((p) => ({ id: p.id, size: '42' })),
        products,
      ),
    ).toThrow('Список слишком длинный');
  });
});
