import { describe, it, expect } from 'vitest';
import { productPurpose, isMonochrome } from '../src/lib/product-collections';
import { filterCatalog, filtersSchema, filterParams } from '../src/lib/catalog';
import { demoProducts } from '../src/lib/demo';
import { productDescription } from '../src/lib/product-description';
import { nikeMedia, pumaMedia, reebokMedia } from '../scripts/product-media.mjs';

describe('Подборки и метаданные товара', () => {
  it('не объявляет любую неизвестную модель повседневной', () => {
    expect(productPurpose({ name: 'Mystery Shoes' })).toBe('');
    expect(productPurpose({ name: 'Air Max', usage: 'Lifestyle Nike Sportswear' })).toBe('daily');
    expect(productPurpose({ name: 'Road Running Shoes' })).toBe('running');
    expect(productPurpose({ name: 'Nano Training Shoes' })).toBe('training');
    expect(productPurpose({ name: 'Basketball Shoes', usage: 'Lifestyle' })).toBe('basketball');
  });
  it('отбрасывает яркие смешанные цвета и отсутствующие расцветки', () => {
    expect(isMonochrome('PUMA Black/PUMA White')).toBe(true);
    expect(isMonochrome('White/Black/Metallic Silver')).toBe(true);
    expect(isMonochrome('Black/University Red/White')).toBe(false);
    expect(isMonochrome('')).toBe(false);
  });
  it('совмещает подборку с ценой и сохраняет её в ссылке', () => {
    const products = [
      { ...demoProducts[0], id: 'a', name: 'Running Shoes', saleKzt: 20000, sizePrices: undefined },
      { ...demoProducts[0], id: 'b', name: 'Running Shoes', saleKzt: 40000, sizePrices: undefined },
      {
        ...demoProducts[0],
        id: 'c',
        name: 'Training Shoes',
        saleKzt: 20000,
        sizePrices: undefined,
      },
    ];
    const f = filtersSchema.parse({ collection: 'running', maxPrice: 25000 });
    expect(filterCatalog(products, f).products.map((p) => p.id)).toEqual(['a']);
    expect(filtersSchema.parse(Object.fromEntries(filterParams(f, 'live')))).toEqual(f);
    expect(filtersSchema.safeParse({ collection: 'invented' }).success).toBe(false);
  });
  it('краткое описание использует подтверждённое назначение', () => {
    expect(
      productDescription({
        ...demoProducts[0],
        gender: 'men',
        name: 'Example',
        usage: 'Lifestyle',
      }),
    ).toBe('Мужские кроссовки на каждый день.');
  });
  it('принимает фотографии выбранного цвета и только разрешённые адреса', () => {
    const p = {
      contentImages: [
        { cardType: 'image', properties: { squarish: { url: 'https://static.nike.com/a.png' } } },
      ],
      taxonomyLabels: { Sports: ['Lifestyle'] },
      colorDescription: 'White',
    };
    expect(nikeMedia(p).image_urls).toEqual(['https://static.nike.com/a.png']);
    expect(nikeMedia(p).usage).toContain('Lifestyle');
    expect(reebokMedia({ images: [{ src: 'https://evil.test/a.png' }] }).image_urls).toEqual([]);
    const state = {
      props: {
        urqlState: {
          a: {
            data: JSON.stringify({
              product: {
                variations: [
                  { id: '1_01', images: [{ href: 'https://images.puma.com/white.png' }] },
                  { id: '1_02', images: [{ href: 'https://images.puma.com/red.png' }] },
                ],
              },
            }),
          },
        },
      },
    };
    expect(pumaMedia(state, '1_01').image_urls).toEqual(['https://images.puma.com/white.png']);
  });
});
