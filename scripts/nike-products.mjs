import { nikeEuSize } from '../src/lib/nike-sizes.mjs';
export const nikeSaleUrl = 'https://www.nike.com/w/sale-shoes-3yaepzy7ok';
export function nikeProductUrl(value) {
  try {
    const u = new URL(value);
    if (
      u.origin !== 'https://www.nike.com' ||
      u.username ||
      u.password ||
      u.search ||
      !/^\/t\/[^/]+\/[A-Z0-9]{6}-\d{3}$/.test(u.pathname)
    )
      return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}
export function nikeSaleCandidates(groups) {
  const candidates = new Map();
  for (const group of groups || [])
    for (const p of group.products || []) {
      const url = nikeProductUrl(p.pdpUrl?.url);
      const text = `${p.copy?.title || ''} ${p.copy?.subTitle || ''}`;
      if (
        !url ||
        p.productType !== 'FOOTWEAR' ||
        !/shoes|sneakers/i.test(text) ||
        /cleats?|sandals?|slides?|boots?|spikes?|slippers?|mules?/i.test(text) ||
        p.prices?.currency !== 'USD' ||
        !(p.prices.currentPrice > 0 && p.prices.currentPrice < p.prices.initialPrice)
      )
        continue;
      candidates.set(p.productCode, { sku: p.productCode, name: text.trim(), product_url: url });
    }
  return [...candidates.values()];
}

// Серверный HTML Nike содержит ВСЕ размеры без остатков. Принимаем только JSON-LD,
// обновлённый страницей после загрузки: отдельный Offer/InStock с GTIN и ценой.
export function verifiedNikeProduct(snapshot, url, checkedAt = new Date().toISOString()) {
  if (!nikeProductUrl(url)) throw Error('NIKE_PRODUCT_URL_INVALID');
  const page = snapshot.nextData?.props?.pageProps;
  const p = page?.selectedProduct;
  if (page?.marketPlace !== 'US' || page?.locale?.country !== 'us' || p?.prices?.currency !== 'USD')
    throw Error('NIKE_REGION_MISMATCH');
  if (!p || p.styleColor !== url.split('/').pop() || nikeProductUrl(p.pdpUrl?.url) !== url)
    throw Error('NIKE_SKU_MISMATCH');
  const name =
    p.productInfo?.fullTitle || `${p.productInfo?.title || ''} ${p.productInfo?.subtitle || ''}`;
  if (
    p.productType !== 'FOOTWEAR' ||
    !/shoes|sneakers/i.test(name) ||
    /cleats?|sandals?|slides?|boots?|spikes?|slippers?|mules?/i.test(name)
  )
    return null;
  if (
    p.isMemberProduct ||
    p.isRestrictedAccess ||
    p.isReservedForYou ||
    p.isLaunchProduct ||
    p.isNBY
  )
    return null;
  if (!(p.prices.currentPrice > 0 && p.prices.currentPrice < p.prices.initialPrice)) return null;
  const gender = /kids|baby|toddler/i.test(name)
    ? 'kids'
    : /women/i.test(name)
      ? 'women'
      : /\bmen/i.test(name)
        ? 'men'
        : 'unisex';
  const flat = (items) =>
    (Array.isArray(items) ? items : [items]).flatMap((x) =>
      Array.isArray(x) ? flat(x) : x?.['@graph'] ? flat(x['@graph']) : x ? [x] : [],
    );
  const variants = [];
  let image;
  for (const group of flat(snapshot.structuredData))
    for (const variant of group.hasVariant || []) {
      const offer = variant.offers;
      if (
        variant.mpn !== p.styleColor ||
        !variant.size ||
        !variant.gtin ||
        !offer ||
        offer['@type'] !== 'Offer' ||
        offer.availability !== 'https://schema.org/InStock' ||
        offer.priceCurrency !== 'USD' ||
        nikeProductUrl(offer.url) !== url
      )
        continue;
      const native = p.sizes?.find(
        (s) =>
          String(s.label) === String(variant.size) &&
          s.status === 'ACTIVE' &&
          s.gtins?.some((g) => String(g.gtin) === String(variant.gtin)),
      );
      if (!native) continue;
      const radio = snapshot.sizes?.find((s) => s.value === String(variant.size));
      if (!radio || radio.disabled || radio.ariaDisabled || !snapshot.canAdd) continue;
      const eu = nikeEuSize(native.localizedLabel || native.label, p.productInfo?.subtitle);
      const sale = Number(offer.price),
        old = Number(p.prices.initialPrice);
      if (!eu || !Number.isFinite(sale) || sale <= 0 || sale >= old) continue;
      try {
        if (new URL(variant.image).origin !== 'https://static.nike.com') continue;
      } catch {
        continue;
      }
      image ||= variant.image;
      variants.push({
        id: String(variant.gtin),
        size: `EU ${eu}`,
        sourceSize: String(native.localizedLabel || native.label),
        salePrice: sale.toFixed(2),
        originalPrice: old.toFixed(2),
        available: true,
        checkedAt,
      });
    }
  if (!variants.length) return null;
  if (
    new Set(variants.map((v) => v.size)).size !== variants.length ||
    new Set(variants.map((v) => v.id)).size !== variants.length
  )
    throw Error('NIKE_DUPLICATE_VARIANT');
  return {
    source: 'nike',
    brand: 'Nike',
    sku: p.styleColor,
    name,
    image_url: image,
    product_url: url,
    old_price: p.prices.initialPrice,
    sale_price: p.prices.currentPrice,
    currency: 'USD',
    gender,
    checked_at: checkedAt,
    size_price_verified: true,
    variants,
  };
}

export async function nikeSnapshot(page) {
  return page.evaluate(() => {
    const parse = (s) => {
      try {
        return JSON.parse(s || 'null');
      } catch {
        return null;
      }
    };
    const button = document.querySelector('[data-testid="atb-button"]');
    return {
      nextData: parse(document.querySelector('#__NEXT_DATA__')?.textContent),
      structuredData: [...document.querySelectorAll('script[type="application/ld+json"]')].map(
        (s) => parse(s.textContent),
      ),
      canAdd: Boolean(
        button && !button.disabled && button.getAttribute('aria-disabled') !== 'true',
      ),
      sizes: [...document.querySelectorAll('input[name="grid-selector-input"]')].map((s) => ({
        value: s.value,
        disabled: s.disabled,
        ariaDisabled: s.getAttribute('aria-disabled') === 'true',
      })),
    };
  });
}
