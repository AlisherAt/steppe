import { describe, expect, it } from 'vitest';
import { sizeGuideRows } from '../src/lib/size-guide';

describe('размеры для покупателей в Казахстане', () => {
  it('сохраняет исходный EU Puma и различает мужскую и женскую US', () => {
    const sizes = ['42', 'EU 38,5'];
    expect(sizeGuideRows({ brand: 'Puma', gender: 'men', sizes })[0]).toEqual({
      native: '42',
      eu: 42,
      ru: 41,
      us: 'US M 9',
      cm: 27,
    });
    expect(sizeGuideRows({ brand: 'Puma', gender: 'women', sizes })[0].us).toBe('US W 10.5');
    expect(sizeGuideRows({ brand: 'Puma', gender: 'women', sizes })[1]).toMatchObject({
      native: 'EU 38,5',
      eu: 38.5,
      us: 'US W 8',
    });
  });
  it('не смешивает одинаковые номера US M и W Reebok', () => {
    const rows = sizeGuideRows({
      brand: 'Reebok',
      gender: 'unisex',
      sizes: ['US M 9', 'US W 9', 'US 9'],
    });
    expect(rows[0]).toMatchObject({ native: 'US M 9', eu: 42, ru: 41 });
    expect(rows[1]).toMatchObject({ native: 'US W 9', eu: 40, ru: 39 });
    expect(rows[2]).toEqual({ native: 'US 9', us: 'US 9' });
  });
  it('не применяет сетку Puma к Reebok и не заполняет пропуски формулой', () => {
    expect(sizeGuideRows({ brand: 'Puma', gender: 'men', sizes: ['US M 12'] })[0].eu).toBe(46);
    expect(sizeGuideRows({ brand: 'Reebok', gender: 'men', sizes: ['US M 12'] })[0].eu).toBe(45.5);
    expect(
      sizeGuideRows({ brand: 'Reebok', gender: 'women', sizes: ['US W 11.5'] })[0].eu,
    ).toBeUndefined();
  });
  it('не преобразует детские, широкие, неизвестные размеры или чужой бренд', () => {
    expect(sizeGuideRows({ brand: 'Reebok', gender: 'kids', sizes: ['US K 4', 'US 4'] })).toEqual([
      { native: 'US K 4', us: 'US K 4' },
      { native: 'US 4', us: 'US 4' },
    ]);
    expect(sizeGuideRows({ brand: 'Puma', gender: 'kids', sizes: ['36'] })[0]).toEqual({
      native: '36',
      eu: 36,
    });
    expect(
      sizeGuideRows({
        brand: 'Reebok',
        gender: 'men',
        sizes: ['US M 9 4E', 'XS', 'US M 25'],
      }).every((r) => r.eu === undefined),
    ).toBe(true);
    expect(sizeGuideRows({ brand: 'Nike', gender: 'men', sizes: ['42'] })[0].ru).toBeUndefined();
  });
});
