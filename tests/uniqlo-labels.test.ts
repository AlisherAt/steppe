import { describe, expect, it } from 'vitest';
import {
  uniqloName,
  isAllowedUniqloProduct,
  uniqloClothingCategories,
} from '../src/lib/uniqlo-labels.mjs';
import { uniqloProducts } from '../scripts/clothing/uniqlo.mjs';
import { uniqloFeedProducts } from '../scripts/clothing/products.mjs';
import { clothingProduct } from '../src/lib/server/clothing';
import fixture from './fixtures/uniqlo-clothing.json';

describe('ассортимент и перевод Uniqlo', () => {
  it.each([
    '季節限定 ピンクッション',
    '季節限定　トルコギキョウ',
    'シルクプリントスカーフ',
    'ヒートテックライニンググローブ/スウェードタッチ',
    'ヒートテックニットグローブ',
    '히트텍라이닝글러브(페이크스웨이드)',
    '히트텍미튼(패디드)',
    'ヒートテック毛布/シングル',
    'ヒートテック敷きパッド/ダブル',
    'GIRLS ヒートテックソックス/2足組',
    'KIDS히트텍삭스2P(라인)',
    '수플레얀청키스톨',
    'ラウンドミニショルダーバッグ',
    'スウェットルームシューズ',
    'Cotton scarf',
    'Glass vase',
    'Fleece gloves',
    'HEATTECH',
    'AIRism',
    'NANODESIGN',
    'fleece',
    'knit',
    'down',
    'Unknown product',
    'スフレヤーンニットアームウォーマー',
    '카우스참',
  ])('не превращает %s в одежду даже с общими breadcrumbs', (name) => {
    expect(uniqloName(name, 'men jackets shirts').allowed).toBe(false);
    expect(
      isAllowedUniqloProduct({ brand: 'Uniqlo', usage: name, category: 'Куртки и верхняя одежда' }),
    ).toBe(false);
    const detail = structuredClone(fixture.detail);
    detail.result.name = name;
    expect(
      uniqloProducts(detail, fixture.stocks, 'uniqlo-kr', {
        productId: detail.result.productId,
        priceGroup: detail.result.priceGroup,
      }),
    ).toEqual([]);
  });
  it.each([
    ['ブロードシャツ/ボタンダウン', 'Рубашка', 'Футболки и рубашки'],
    ['レーヨンブラウス', 'Блузка', 'Футболки и рубашки'],
    ['레이온블라우스(반팔)', 'Блузка', 'Футболки и рубашки'],
    ['ストレッチウールジャケット', 'Пиджак', 'Пиджаки'],
    ['감탄블레이저', 'Пиджак', 'Пиджаки'],
    ['フリースレギンス/10分丈', 'Леггинсы', 'Леггинсы'],
    ['ヒートテックニットキャップ', 'Шапка', 'Головные уборы'],
    ['エアリズムウルトラストレッチセット', 'Домашний комплект', 'Домашняя одежда'],
    ['フライスカバーオール/前開き', 'Комбинезон', 'Боди и комбинезоны'],
    ['BN립커버올(긴팔)', 'Комбинезон', 'Боди и комбинезоны'],
    ['배럴진(코듀로이)', 'Джинсы', 'Брюки и джинсы'],
    ['タックワイドショーツ', 'Шорты', 'Шорты'],
    ['スウェットワイドショーツ', 'Шорты', 'Шорты'],
    ['GIRLS エアリズムシームレスショーツ/3枚組', 'Трусы', 'Топы и бельё'],
    ['超極暖ヒートテックハイネックT/長袖', 'Водолазка', 'Футболки и рубашки'],
    ['SUPIMA COTTON T(긴팔)', 'Лонгслив', 'Футболки и рубашки'],
    ['ウルトラライトダウンジャケット', 'Пуховик', 'Куртки и верхняя одежда'],
  ])('%s → %s, %s', (original, noun, category) => {
    const label = uniqloName(original);
    expect(label.allowed).toBe(true);
    expect(label.name.startsWith(noun + ' Uniqlo')).toBe(true);
    expect(label.category).toBe(category);
    expect(uniqloClothingCategories).toContain(label.category);
  });
  it('отсеивает аксессуары из фида и при публикации старого отчёта', () => {
    const now = Date.now();
    const checked = new Date(now).toISOString();
    expect(
      uniqloFeedProducts(
        {
          version: 1,
          generatedAt: checked,
          products: [{ name: 'HEATTECH gloves' }, { name: 'Unknown' }, { name: 'Linen shirt' }],
        },
        'uniqlo-kr',
        now,
      ),
    ).toHaveLength(1);
    const p = uniqloProducts(
      fixture.detail,
      fixture.stocks,
      'uniqlo-kr',
      {
        productId: fixture.detail.result.productId,
        priceGroup: fixture.detail.result.priceGroup,
      },
      now,
    )[0];
    expect(() =>
      clothingProduct({ ...p, usage: 'ヒートテックグローブ' }, 'uniqlo-kr', [], now),
    ).toThrow('UNIQLO_NOT_RECOGNIZED_CLOTHING');
    expect(isAllowedUniqloProduct({ brand: 'Uniqlo', name: 'Одежда Uniqlo' })).toBe(false);
    expect(isAllowedUniqloProduct({ brand: 'Nike', name: 'Nike shoes' })).toBe(true);
  });
});
