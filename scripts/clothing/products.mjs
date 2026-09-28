import { reebokMedia, pumaMedia } from '../product-media.mjs';
import { pumaEmbeddedVariants } from '../puma-details.mjs';
import { uniqloName } from '../../src/lib/uniqlo-labels.mjs';

export const clothingSources = {
  nike: {
    id: 'nike-us',
    brand: 'Nike',
    market: 'US',
    currency: 'USD',
    department: 'sportswear',
    url: 'https://www.nike.com/w/sale-clothing-3yaepz6ymx6',
  },
  puma: {
    id: 'puma-us',
    brand: 'Puma',
    market: 'US',
    currency: 'USD',
    department: 'sportswear',
    url: 'https://us.puma.com/us/en/sale/all-sale?filter_product_division=%3E%7Bclothing%7D',
  },
  reebok: {
    id: 'reebok-us',
    brand: 'Reebok',
    market: 'US',
    currency: 'USD',
    department: 'sportswear',
    url: 'https://www.reebok.com/collections/sale',
  },
  'uniqlo-jp': {
    id: 'uniqlo-jp',
    brand: 'Uniqlo',
    market: 'JP',
    currency: 'JPY',
    department: 'casual',
    url: 'https://www.uniqlo.com/jp/ja/feature/sale/men',
  },
  'uniqlo-kr': {
    id: 'uniqlo-kr',
    brand: 'Uniqlo',
    market: 'KR',
    currency: 'KRW',
    department: 'casual',
    url: 'https://www.uniqlo.com/kr/ko/feature/sale/men',
  },
};
const categories = [
  [/hoodie|フーディ|후드/i, 'Худи'],
  [
    /sweatshirt|sweater|cardigan|ニット|セーター|カーディガン|니트|스웨터|가디건/i,
    'Свитшоты и трикотаж',
  ],
  [
    /jacket|coat|blouson|vest|ジャケット|コート|パーカ|베스트|재킷|파카|블루종/i,
    'Куртки и верхняя одежда',
  ],
  [/shorts|ショーツ|ショートパンツ|쇼트|쇼츠/i, 'Шорты'],
  [/leggings|tights|レギンス|레깅스/i, 'Леггинсы'],
  [/pants|trousers|jeans|パンツ|ジーンズ|팬츠|진즈/i, 'Брюки и джинсы'],
  [/dress|skirt|ワンピース|スカート|스커트|원피스/i, 'Платья и юбки'],
  [/sports bra|ブラ|브라/i, 'Спортивные топы'],
  [/shirt|tee|polo|シャツ|폴로|셔츠|그래픽T/i, 'Футболки и рубашки'],
];
export const clothingCategory = (name) => categories.find(([r]) => r.test(name))?.[1] || 'Одежда';
export const clothingGender = (name) =>
  /women|womens|WOMEN/i.test(name)
    ? 'women'
    : /kids|baby|toddler|junior|youth/i.test(name)
      ? 'kids'
      : /\bmen\b|mens/i.test(name)
        ? 'men'
        : 'unisex';
export const validClothingSize = (s) =>
  typeof s === 'string' && !!s.trim() && s.length <= 20 && !/[\r\n<>]/.test(s);

export function reebokClothing(p, now = new Date().toISOString()) {
  if (
    p.vendor !== 'Reebok' ||
    !p.published_at ||
    !/^(Shorts|Pants|Sports Bras|T-Shirts|Hoodies|Leggings|Sweatshirts|Jackets|Shirts|Leggings & Tights|Tracksuits|Dresses|Skirts|Tank Tops|Tops|Polos)$/i.test(
      p.product_type,
    )
  )
    return [];
  const sizeOption = p.options?.find((o) => /^size$/i.test(o.name));
  const colorOption = p.options?.find((o) => /^colou?r$/i.test(o.name));
  if (!sizeOption || ![1, 2, 3].includes(sizeOption.position) || !/^[a-z0-9-]+$/.test(p.handle))
    return [];
  const groups = new Map();
  for (const v of p.variants || []) {
    const size = String(v['option' + sizeOption.position] || '').trim();
    const sale = Number(v.price),
      old = Number(v.compare_at_price);
    if (
      !v.available ||
      v.requires_selling_plan ||
      !validClothingSize(size) ||
      !(sale > 0 && old > sale)
    )
      continue;
    const color = colorOption ? String(v['option' + colorOption.position]) : '';
    const group = groups.get(color) || {
      color,
      image: v.featured_image?.src || p.images?.[0]?.src,
      variants: [],
    };
    group.variants.push({
      id: String(v.id),
      size,
      salePrice: sale.toFixed(2),
      originalPrice: old.toFixed(2),
      available: true,
      checkedAt: now,
    });
    groups.set(color, group);
  }
  return [...groups.values()].flatMap((g, i) => {
    if (!g.image || new Set(g.variants.map((v) => v.size)).size !== g.variants.length) return [];
    const style =
      p.variants.find((v) => String(v.id) === g.variants[0].id)?.sku?.match(/^([^-]+)-/)?.[1] ||
      String(p.id);
    return [
      {
        source: 'reebok',
        brand: 'Reebok',
        sku: style,
        name: p.title,
        category: clothingCategory(p.product_type),
        color: g.color,
        image_url: g.image,
        image_urls: [g.image, ...reebokMedia(p).image_urls]
          .filter((u, i, a) => a.indexOf(u) === i)
          .slice(0, 10),
        product_url: `https://www.reebok.com/products/${p.handle}?variant=${g.variants[0].id}`,
        currency: 'USD',
        gender: clothingGender(p.title),
        checked_at: now,
        variants: g.variants,
      },
    ];
  });
}

export function pumaClothing(snapshot, candidate, now = new Date().toISOString()) {
  const entries = Object.values(snapshot.state?.props?.urqlState || {}).flatMap((e) => {
    try {
      const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      return d?.product?.id === candidate.sku.split('_')[0] ? [d.product] : [];
    } catch {
      return [];
    }
  });
  const p = entries.find((p) => p.productDivision === 'Apparel');
  if (!p || !snapshot.canAdd) return null;
  const identity = Object.fromEntries(
    snapshot.sizes.filter((s) => validClothingSize(s.us)).map((s) => [s.us, s.us]),
  );
  const variants = pumaEmbeddedVariants(
    snapshot.state,
    candidate.sku,
    identity,
    snapshot.sizes,
    snapshot.displayed,
    now,
  );
  if (!variants?.length) return null;
  const media = pumaMedia(snapshot.state, candidate.sku);
  const image = media.image_urls[0] || snapshot.image;
  if (!image) return null;
  return {
    ...candidate,
    name: p.name,
    category: clothingCategory(p.name),
    ...media,
    image_url: image,
    gender: clothingGender(p.name),
    checked_at: now,
    variants: variants.map((v) => ({
      id: v.id,
      size: v.sizeUS,
      salePrice: v.salePrice,
      originalPrice: v.originalPrice,
      available: true,
      checkedAt: now,
    })),
  };
}

// Разрешённый фид Uniqlo: варианты содержат цену и остаток конкретного цвета/размера.
// Никаких диапазонов размеров из листинга или выдуманной зачёркнутой цены.
export function uniqloFeedProducts(data, source, now = Date.now()) {
  const config = clothingSources[source];
  if (
    !config ||
    !source.startsWith('uniqlo-') ||
    data.version !== 1 ||
    !Array.isArray(data.products) ||
    data.products.length > 10000 ||
    !Number.isFinite(Date.parse(data.generatedAt)) ||
    now - Date.parse(data.generatedAt) > 36 * 3600000 ||
    Date.parse(data.generatedAt) > now + 60000
  )
    throw Error('UNIQLO_INVALID_FEED');
  return data.products
    .filter((p) => uniqloName(p.usage || p.name || '').allowed)
    .map((p) => ({
      ...p,
      source,
      brand: 'Uniqlo',
      currency: config.currency,
      checked_at: p.checked_at || data.generatedAt,
      usage: p.usage || p.name,
      category: uniqloName(p.usage || p.name).category,
    }));
}
