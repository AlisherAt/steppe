import type { Product } from './types';
import { isMonochrome, productPurpose } from './product-collections';
export type Outfit = {
  id: string;
  title: string;
  description: string;
  gender: 'men' | 'women';
  products: Product[];
  total: number;
  variablePrice: boolean;
};
const specs = [
  {
    id: 'base',
    title: 'Спокойная база',
    description: 'Нейтральные оттенки. Простое сочетание на каждый день.',
  },
  {
    id: 'mono',
    title: 'Чёрное + белое',
    description: 'Одна палитра — три вещи, которые легко сочетать.',
  },
  {
    id: 'city',
    title: 'На учёбу и в город',
    description: 'Верх, брюки и кроссовки для твоего повседневного образа.',
  },
  {
    id: 'budget',
    title: 'Образ до 50 000 ₸',
    description: 'Три вещи в одном бюджете. Можно заказать каждую отдельно.',
  },
] as const;
function neutral(color = '') {
  const parts = color
    .toLowerCase()
    .replace(/puma|nike|reebok/g, '')
    .split(/[\s/,_-]+/)
    .filter(Boolean);
  return (
    parts.length > 0 &&
    parts.every((part) =>
      /^(black|white|grey|gray|navy|beige|cream|natural|brown|sand|ivory|off|dark|light|pale|soft|silver|sail|chalk|core|ftwr|cloud|phantom|anthracite|чёрный|черный|белый|серый|бежевый)$/.test(
        part,
      ),
    )
  );
}
function slot(p: Product): 'shoes' | 'top' | 'bottom' | null {
  const text = `${p.name} ${p.usage || ''}`;
  // Некоторые исходные карточки ошибочно размечены как unisex: проверяем также название.
  if (
    /\b(kids?|junior|jr|boys?|girls?|toddler|baby|infant|youth)\b|ベビー|キッズ|아동|키즈/i.test(
      text,
    )
  )
    return null;
  if (!p.department || p.department === 'sneakers') {
    if (/soccer|football|cleats?|volleyball|футбол|бутсы|волейбол/i.test(text)) return null;
    if (['running', 'training', 'basketball'].includes(productPurpose(p))) return null;
    return /classic|pacific|court|club|caven|suede|palermo|air force|dunk|smash|royal|canvas|carina|street|tennis/i.test(
      p.name,
    ) || productPurpose(p) === 'daily'
      ? 'shoes'
      : null;
  }
  if (p.category === 'Брюки и джинсы' && !/кюлот|culotte|キュロット|underwear|термо/i.test(text))
    return 'bottom';
  if (
    ['Футболки и рубашки', 'Худи', 'Свитшоты и трикотаж'].includes(p.category) &&
    !/майка|tank|underwear|термо|タンクトップ/i.test(text)
  )
    return 'top';
  return null;
}
const maxPrice = (p: Product) => Math.max(p.saleKzt, ...(p.sizePrices || []).map((v) => v.saleKzt));
export function buildOutfits(products: Product[]): Outfit[] {
  const available = [
    ...new Map(
      products
        .filter((p) => !p.demo && p.imageUrl && p.sizes.length && p.saleKzt > 0)
        .map((p) => [p.id, p]),
    ).values(),
  ];
  const outfits: Outfit[] = [];
  for (const gender of ['women', 'men'] as const) {
    const used = new Set<string>();
    for (const spec of specs) {
      const candidates = available.filter(
        (p) =>
          (p.gender === gender || p.gender === 'unisex') &&
          (spec.id === 'base'
            ? neutral(p.color)
            : spec.id === 'mono'
              ? isMonochrome(p.color)
              : true),
      );
      const selected = (['shoes', 'top', 'bottom'] as const).map(
        (type) =>
          candidates
            .filter((p) => slot(p) === type)
            .sort(
              (a, b) =>
                Number(b.sizes.length >= 3) - Number(a.sizes.length >= 3) ||
                (spec.id === 'budget'
                  ? maxPrice(a) - maxPrice(b) || a.id.localeCompare(b.id)
                  : Number(used.has(a.id)) - Number(used.has(b.id)) ||
                    Number(b.gender === gender) - Number(a.gender === gender) ||
                    a.saleKzt - b.saleKzt ||
                    a.id.localeCompare(b.id)),
            )[0],
      );
      if (selected.some((p) => !p)) continue;
      const items = selected as Product[];
      // Бюджет выдерживается даже для самых дорогих доступных размеров.
      if (spec.id === 'budget' && items.reduce((sum, p) => sum + maxPrice(p), 0) > 50000) continue;
      if (
        spec.id !== 'budget' &&
        outfits.some((o) => o.gender === gender && o.products.every((p, i) => p.id === items[i].id))
      )
        continue;
      items.forEach((p) => used.add(p.id));
      outfits.push({
        ...spec,
        id: `${gender}-${spec.id}`,
        gender,
        products: items,
        total: items.reduce((sum, p) => sum + p.saleKzt, 0),
        variablePrice: items.some((p) => new Set(p.sizePrices?.map((v) => v.saleKzt)).size > 1),
      });
    }
  }
  return outfits;
}
