import { describe, expect, it } from 'vitest';
import { toKzt, discountPercent } from '../src/lib/money';
import { filterCatalog, filtersSchema } from '../src/lib/catalog';
import { defaultFilters } from '../src/lib/types';
import { demoProducts } from '../src/lib/demo';
import { addToCart, readCart, writeCart, CART_KEY } from '../src/lib/cart';
import { deduplicate, feedProductSchema, toProduct } from '../src/lib/server/adapters';
import { assertFresh, parseNbk } from '../src/lib/server/rates';
import { isPrivateAddress, publicHttps } from '../src/lib/server/http';
const sample = {
  id: 'sku-1',
  brand: 'Nike',
  name: 'Test shoe',
  productUrl: 'https://www.nike.com/t/test?utm_source=one',
  originalPrice: '100.00',
  salePrice: '60.00',
  currency: 'USD',
  sizes: ['40'],
  gender: 'unisex' as const,
  category: 'Бег',
  available: true,
  imageUrl: null,
};
describe('Точные цены', () => {
  it('округляет половину тенге вверх без двоичной ошибки', () => {
    expect(toKzt('0.1', '505')).toBe(51);
    expect(toKzt('99.99', '500.55')).toBe(50050);
  });
  it('не принимает отрицательные, бесконечные и нулевые курсы', () => {
    for (const rate of ['0', '-1', 'Infinity', 'NaN']) expect(() => toKzt('10', rate)).toThrow();
    expect(() => toKzt('-1', '500')).toThrow();
  });
  it('округляет скидку вниз и отвергает завышенную цену', () => {
    expect(discountPercent('99.99', '60')).toBe(39);
    expect(discountPercent('100', '50')).toBe(50);
    expect(() => discountPercent('50', '60')).toThrow();
    expect(() => discountPercent('0', '0')).toThrow();
  });
  it('сохраняет исходную цену, валюту и курс', () => {
    const p = toProduct(sample, { id: 'nike', name: 'Nike' }, [
      {
        currency: 'USD',
        value: '500',
        source: 'Test provider',
        asOf: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
      },
    ]);
    expect(p.salePrice).toBe('60.00');
    expect(p.saleKzt).toBe(30000);
    expect(p.currency).toBe('USD');
    expect(p.demo).toBe(false);
    expect(p.id).toHaveLength(64);
  });
  it('не публикует цену без курса', () =>
    expect(() => toProduct(sample, { id: 'nike', name: 'Nike' }, [])).toThrow());
});
describe('Поиск и фильтрация', () => {
  it('комбинирует поисковый запрос, бренд, размер и цену', () => {
    const result = filterCatalog(demoProducts, {
      ...defaultFilters,
      q: 'городской',
      brands: ['Nike'],
      sizes: ['42'],
      maxPrice: 45000,
    });
    expect(result.products).toHaveLength(1);
    expect(result.products[0].id).toBe('demo-1');
  });
  it('фильтрует пол, назначение, источник и скидку', () => {
    const result = filterCatalog(demoProducts, {
      ...defaultFilters,
      gender: 'women',
      category: 'Бег',
      sources: ['adidas'],
      minDiscount: 50,
    });
    expect(result.products.map((p) => p.id)).toEqual(['demo-6']);
  });
  it('сортирует по скидке и цене', () => {
    const byDiscount = filterCatalog(demoProducts, {
      ...defaultFilters,
      sort: 'discount',
    }).products;
    expect(byDiscount[0].discount).toBe(50);
    const byPrice = filterCatalog(demoProducts, { ...defaultFilters, sort: 'price_asc' }).products;
    expect(byPrice[0].saleKzt).toBe(23990);
  });
  it('разделяет пустые результаты и список доступных фильтров', () => {
    const r = filterCatalog(demoProducts, { ...defaultFilters, q: 'не существует' });
    expect(r.total).toBe(0);
    expect(r.facets.brands).toEqual(['Adidas', 'Nike']);
  });
  it('валидирует диапазон, сортировку и страницы', () => {
    expect(filtersSchema.safeParse({ minPrice: '100', maxPrice: '10' }).success).toBe(false);
    expect(filtersSchema.safeParse({ page: '0' }).success).toBe(false);
    expect(filtersSchema.safeParse({ sort: 'injection' }).success).toBe(false);
    expect(filtersSchema.parse({ brands: 'Nike,Adidas' }).brands).toEqual(['Nike', 'Adidas']);
  });
});
describe('Дедупликация фида', () => {
  it('схлопывает повторы id и tracking-ссылок, объединяет размеры', () => {
    const r = deduplicate([
      sample,
      {
        ...sample,
        id: 'second-id',
        productUrl: 'https://www.nike.com/t/test?utm_source=two',
        sizes: ['41', '40'],
      },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].sizes).toEqual(['40', '41']);
    expect(sample.sizes).toEqual(['40']);
  });
  it('не смешивает разные цены и валюты', () => {
    expect(() => deduplicate([sample, { ...sample, salePrice: '50' }])).toThrow(
      'CONFLICTING_DUPLICATE',
    );
    expect(() => deduplicate([sample, { ...sample, currency: 'EUR' }])).toThrow();
  });
  it('сохраняет разные варианты с параметрами товара', () =>
    expect(
      deduplicate([
        sample,
        { ...sample, id: 'second', productUrl: 'https://www.nike.com/t/test?color=blue' },
      ]),
    ).toHaveLength(2));
  it('отвергает неверные цены', () => {
    expect(feedProductSchema.safeParse({ ...sample, salePrice: '101' }).success).toBe(false);
    expect(feedProductSchema.safeParse({ ...sample, salePrice: 'free' }).success).toBe(false);
  });
});
describe('Корзина и перезагрузка', () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) || null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  };
  it('восстанавливает товары и размеры после сериализации', () => {
    const items = addToCart([], demoProducts[0], '42');
    writeCart(storage, items);
    expect(readCart(storage)).toEqual(items);
  });
  it('не дублирует пару с тем же размером; другой размер сохраняет отдельно', () => {
    let items = addToCart([], demoProducts[0], '42');
    items = addToCart(items, demoProducts[0], '42');
    expect(items).toHaveLength(1);
    expect(addToCart(items, demoProducts[0], '43')).toHaveLength(2);
  });
  it('не принимает отсутствующий размер', () =>
    expect(() => addToCart([], demoProducts[0], '10')).toThrow());
  it('восстанавливается после испорченных данных и отвергает javascript-ссылку', () => {
    storage.setItem(CART_KEY, '{broken');
    expect(readCart(storage)).toEqual([]);
    const item = addToCart([], demoProducts[0], '42')[0];
    storage.setItem(
      CART_KEY,
      JSON.stringify({ version: 1, items: [{ ...item, productUrl: 'javascript:alert(1)' }] }),
    );
    expect(readCart(storage)).toEqual([]);
  });
});
describe('Курсы НБРК', () => {
  const now = new Date('2026-09-24T10:00:00Z');
  it('учитывает номинал валюты и дату курса', () => {
    const r = parseNbk(
      '<rss><channel><item><title>JPY</title><description>340.50</description><quant>100</quant><pubDate>24.09.2026</pubDate></item></channel></rss>',
      now,
    );
    expect(Number(r[0].value)).toBe(3.405);
    expect(r[0].asOf).toBe('2026-09-23T19:00:00.000Z');
    expect(r[0].source).toBe('Национальный Банк Казахстана');
  });
  it('не принимает просроченный и будущий курс', () => {
    expect(() => assertFresh('2026-09-01T00:00:00Z', now)).toThrow();
    expect(() => assertFresh('2026-09-26T00:00:00Z', now)).toThrow();
  });
  it('отвергает XML с внешними сущностями', () =>
    expect(() =>
      parseNbk('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>', now),
    ).toThrow());
});
describe('Безопасность источников', () => {
  it('разрешает только HTTPS и точные разрешённые домены', () => {
    expect(publicHttps('https://www.nike.com/x', ['www.nike.com']).hostname).toBe('www.nike.com');
    for (const url of [
      'http://www.nike.com',
      'https://www.nike.com.evil.com',
      'https://user:pass@www.nike.com',
      'https://127.0.0.1',
    ])
      expect(() => publicHttps(url, ['www.nike.com'])).toThrow();
  });
  it('блокирует частные IPv4 и IPv6 адреса', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '192.168.1.1',
      '::1',
      '::ffff:127.0.0.1',
      'fc00::1',
    ])
      expect(isPrivateAddress(ip)).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
  });
});
