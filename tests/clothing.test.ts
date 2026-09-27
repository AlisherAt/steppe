import { describe, expect, it } from 'vitest';
import { filterCatalog } from '../src/lib/catalog';
import { defaultFilters, type Product, type Rate } from '../src/lib/types';
import { demoProducts } from '../src/lib/demo';
import { localSizeLabel, matchesSize } from '../src/lib/size-guide';
import { addToCart, readCart, writeCart } from '../src/lib/cart';
import { whatsappOrder } from '../src/lib/whatsapp';
import { clothingProduct } from '../src/lib/server/clothing';
import { uniqloProducts, activeUniqloDiscount } from '../scripts/clothing/uniqlo.mjs';
import { reebokClothing } from '../scripts/clothing/products.mjs';
import { sellingPrice, withSellingPrices } from '../src/lib/selling-price';
import { officialMarketUrl } from '../src/lib/official-stores';
import fixture from './fixtures/uniqlo-clothing.json';
const now = Date.parse('2026-09-27T20:00:00Z');
const rates: Rate[] = ['KRW', 'JPY', 'USD'].map((currency) => ({
  currency,
  value: currency === 'KRW' ? '0.35' : currency === 'JPY' ? '3.3' : '500',
  source: 'TEST ONLY',
  asOf: new Date(now).toISOString(),
  fetchedAt: new Date(now).toISOString(),
}));
const raw = () =>
  uniqloProducts(
    fixture.detail,
    fixture.stocks,
    'uniqlo-kr',
    { productId: fixture.detail.result.productId, priceGroup: fixture.detail.result.priceGroup },
    now,
  )[0];
const shirt = () => clothingProduct(raw(), 'uniqlo-kr', rates, now);
describe('раздельный ассортимент одежды', () => {
  it('изолирует выдачу, бренды, категории и размеры от кроссовок', () => {
    const clothes = shirt();
    const sport = { ...clothes, id: 'sport', department: 'sportswear', brand: 'Nike' } as Product;
    const all = [...demoProducts, clothes, sport];
    expect(
      filterCatalog(all, defaultFilters).products.every(
        (p) => !p.department || p.department === 'sneakers',
      ),
    ).toBe(true);
    const casual = filterCatalog(all, { ...defaultFilters, department: 'casual' });
    expect(casual.total).toBe(1);
    expect(casual.facets.brands).toEqual(['Uniqlo']);
    expect(casual.facets.sizes).not.toContain('42');
    expect(
      filterCatalog(all, { ...defaultFilters, department: 'sportswear' }).products.map((p) => p.id),
    ).toEqual(['sport']);
  });
  it('сохраняет размеры одежды, тип товара и цену в корзине и WhatsApp', () => {
    const p = withSellingPrices(shirt());
    p.sizes = ['100'];
    p.sizePrices = [{ size: '100', salePrice: p.salePrice, saleKzt: p.saleKzt }];
    expect(localSizeLabel(p, '100')).toBe('100');
    expect(matchesSize(p, '100', ['EU 100'])).toBe(false);
    let saved = '';
    const storage = {
      getItem: () => saved,
      setItem: (_k: string, v: string) => {
        saved = v;
      },
    };
    writeCart(storage, addToCart([], p, '100'));
    const [item] = readCart(storage);
    expect(item.department).toBe('casual');
    expect(localSizeLabel(item, item.size)).toBe('100');
    const text = new URL(
      whatsappOrder('77079223074', [{ id: p.id, size: '100' }], [p]),
    ).searchParams.get('text')!;
    expect(text).toContain('Размер: 100');
    expect(text).not.toContain('EU 100');
    expect(text).toContain('Всего товаров: 1');
  });
  it('применяет наценку и округление после конвертации KRW/JPY, не дважды', () => {
    const kr = shirt();
    expect(kr.saleKzt).toBe(4515);
    expect(withSellingPrices(kr).saleKzt).toBe(8000);
    expect(sellingPrice(19999)).toBe(23000);
    expect(sellingPrice(20000)).toBe(23000);
    expect(sellingPrice(21000)).toBe(24500);
    expect(officialMarketUrl('https://www.uniqlo.com/jp/ja/products/E123456-000/00', 'JP')).toBe(
      true,
    );
    expect(officialMarketUrl('https://www.uniqlo.com/us/en/products/E123456-000/00', 'JP')).toBe(
      false,
    );
  });
});
describe('проверка настоящих скидок Uniqlo', () => {
  it('не выдумывает прежнюю цену и процент, когда есть отметка магазина', () => {
    const p = shirt();
    expect(p.originalPrice).toBeNull();
    expect(p.discount).toBe(0);
    expect(p.discountVerified).toBe(true);
    expect(p.department).toBe('casual');
  });
  it('сопоставляет остатки строго по l2Id, исключает sold out и обычную цену', () => {
    const f = structuredClone(fixture);
    for (const stock of Object.values(f.stocks.result)) stock.quantity = 0;
    expect(
      uniqloProducts(
        f.detail,
        f.stocks,
        'uniqlo-kr',
        { productId: f.detail.result.productId, priceGroup: '00' },
        now,
      ),
    ).toEqual([]);
    const g = structuredClone(fixture);
    for (const v of g.detail.result.l2s) {
      v.guestFlags.priceFlags = [];
      v.flags.priceFlags = [];
    }
    expect(
      uniqloProducts(
        g.detail,
        g.stocks,
        'uniqlo-kr',
        { productId: g.detail.result.productId, priceGroup: '00' },
        now,
      ),
    ).toEqual([]);
    expect(
      activeUniqloDiscount(
        [{ code: 'limitedOffer', effectiveTime: { start: 0, end: now / 1000 - 1 } }],
        now,
      ),
    ).toBeUndefined();
  });
  it('отклоняет несовпадение валюты, региона, старые цены, дубли размеров и поддельные скидки', () => {
    expect(() => clothingProduct({ ...raw(), currency: 'USD' }, 'uniqlo-kr', rates, now)).toThrow();
    expect(() =>
      clothingProduct(
        { ...raw(), product_url: 'https://www.uniqlo.com/jp/ja/products/E123456-000' },
        'uniqlo-kr',
        rates,
        now,
      ),
    ).toThrow();
    expect(() => clothingProduct(raw(), 'uniqlo-kr', rates, now + 37 * 3600000)).toThrow();
    const p = raw();
    p.variants.push(p.variants[0]);
    expect(() => clothingProduct(p, 'uniqlo-kr', rates, now)).toThrow();
    const q = raw();
    q.discount_verified = false;
    expect(() => clothingProduct(q, 'uniqlo-kr', rates, now)).toThrow();
  });
});
it('Reebok оставляет только скидочные доступные размеры и разделяет цвета', () => {
  const p = {
    id: 1,
    vendor: 'Reebok',
    published_at: '2026-09-27',
    product_type: 'Shorts',
    title: "Men's Shorts",
    handle: 'mens-shorts',
    tags: [],
    images: [{ src: 'https://cdn.shopify.com/test.jpg' }],
    options: [
      { name: 'Color', position: 1, values: ['Black', 'White'] },
      { name: 'Size', position: 2 },
    ],
    variants: [
      {
        id: 1,
        sku: '100-S',
        available: true,
        price: '20',
        compare_at_price: '30',
        option1: 'Black',
        option2: 'S',
      },
      {
        id: 2,
        sku: '101-M',
        available: true,
        price: '22',
        compare_at_price: '30',
        option1: 'White',
        option2: 'M',
      },
      {
        id: 3,
        available: false,
        price: '10',
        compare_at_price: '30',
        option1: 'Black',
        option2: 'L',
      },
      {
        id: 4,
        available: true,
        price: '30',
        compare_at_price: '30',
        option1: 'Black',
        option2: 'XL',
      },
    ],
  };
  const result = reebokClothing(p);
  expect(result).toHaveLength(2);
  expect(result.flatMap((p) => p.variants.map((v: { size: string }) => v.size))).toEqual([
    'S',
    'M',
  ]);
  expect(reebokClothing({ ...p, product_type: 'Shoes' })).toEqual([]);
});
