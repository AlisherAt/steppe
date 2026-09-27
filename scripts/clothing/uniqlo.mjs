import { uniqloName } from '../../src/lib/uniqlo-labels.mjs';
import { request } from '@playwright/test';
import robotsParser from 'robots-parser';
import {
  clothingSources,
  clothingCategory,
  clothingGender,
  validClothingSize,
} from './products.mjs';
const flagsFor = (v) => v.guestFlags?.priceFlags || v.flags?.priceFlags || [];
export function activeUniqloDiscount(flags, now = Date.now()) {
  return flags.find(
    (f) =>
      ['discount', 'limitedOffer'].includes(f.code) &&
      (!f.effectiveTime?.start || f.effectiveTime.start * 1000 <= now) &&
      (!f.effectiveTime?.end || f.effectiveTime.end * 1000 > now),
  );
}
export function uniqloProducts(detail, stocks, source, expected, now = Date.now()) {
  const s = clothingSources[source],
    p = detail?.result;
  if (
    detail?.status !== 'ok' ||
    stocks?.status !== 'ok' ||
    !p ||
    !Array.isArray(p.l2s) ||
    !stocks.result ||
    p.productId !== expected.productId ||
    p.priceGroup !== expected.priceGroup
  )
    throw Error('UNIQLO_DETAIL_MISMATCH');
  const purpose = Object.values(p.breadcrumbs || {})
    .map((v) => v.name)
    .join(' ');
  const groups = new Map();
  for (const v of p.l2s) {
    const stock = stocks.result[v.l2Id];
    const flag = activeUniqloDiscount(flagsFor(v), now);
    const sale = (flag ? v.prices?.promo : null) || v.prices?.base,
      base = v.prices?.base;
    if (
      v.sales !== true ||
      v.salesType !== 'NORMAL' ||
      stock?.statusCode !== 'IN_STOCK' ||
      !(stock.quantity > 0) ||
      stock.disableSizeChip ||
      !validClothingSize(v.size?.name) ||
      sale?.currency?.code !== s.currency ||
      base?.currency?.code !== s.currency ||
      !(sale.value > 0)
    )
      continue;
    const color = v.color?.displayCode;
    if (!/^\d{2}$/.test(color || '')) continue;
    const pl = v.pld?.display?.showFlag ? v.pld.name : '';
    const key = color + '-' + (pl || 'standard');
    const old = flag && Number(base.value) > Number(sale.value) ? String(base.value) : null;
    const image = p.images?.main?.[color]?.image;
    if (!image) continue;
    const g = groups.get(key) || {
      color: v.color.name,
      pl,
      image,
      variants: [],
      ends: [],
      starts: [],
      evidence: [],
    };
    g.variants.push({
      id: v.l2Id,
      size: v.size.name,
      salePrice: String(sale.value),
      originalPrice: old,
      available: true,
      discountEvidence: flag?.code,
      checkedAt: new Date(now).toISOString(),
    });
    if (flag?.effectiveTime?.end) g.ends.push(flag.effectiveTime.end * 1000);
    if (flag?.effectiveTime?.start) g.starts.push(flag.effectiveTime.start * 1000);
    g.evidence.push({
      id: v.l2Id,
      flag: flag?.code || null,
      stock: stock.statusCode,
      quantity: stock.quantity,
    });
    groups.set(key, g);
  }
  return [...groups.entries()].flatMap(([key, g]) => {
    if (new Set(g.variants.map((v) => v.size)).size !== g.variants.length) return [];
    const color = key.slice(0, 2);
    const label = uniqloName(p.name, purpose, g.pl, p.productId);
    return [
      {
        source,
        brand: 'Uniqlo',
        sku: `${p.productId}-${p.priceGroup}-${key}`,
        name: label.name,
        usage: p.name.slice(0, 500),
        category: label.category,
        color: g.color,
        image_url: g.image,
        image_urls: [
          g.image,
          ...(p.images?.sub || [])
            .filter((i) => i.colorCode === color)
            .map((i) => i.image)
            .filter(Boolean),
        ].slice(0, 10),
        product_url: `https://www.uniqlo.com/${s.market.toLowerCase()}/${s.market === 'JP' ? 'ja' : 'ko'}/products/${p.productId}/${p.priceGroup}?colorDisplayCode=${color}`,
        currency: s.currency,
        gender: clothingGender(p.genderName),
        checked_at: new Date(now).toISOString(),
        variants: g.variants,
        discount_verified: g.variants.every((v) => Boolean(v.discountEvidence)),
        ...(g.ends.length ? { sale_ends_at: new Date(Math.min(...g.ends)).toISOString() } : {}),
        ...(g.starts.length
          ? { sale_starts_at: new Date(Math.max(...g.starts)).toISOString() }
          : {}),
        evidence: g.evidence,
      },
    ];
  });
}
export async function collectUniqlo(
  source,
  { deadline = Date.now() + 175 * 60000, limit = 10000, checkpoint = async () => {} } = {},
) {
  const region = source === 'uniqlo-jp' ? 'jp' : 'kr',
    lang = region === 'jp' ? 'ja' : 'ko',
    origin = 'https://www.uniqlo.com',
    base = `${origin}/${region}/api/commerce/v5/${lang}`;
  const client = await request.newContext({
    userAgent: 'SteppeSaleCollector/1.0',
    extraHTTPHeaders: { Accept: 'application/json' },
  });
  const products = new Map(),
    candidates = new Map(),
    errors = [];
  let checked = 0,
    complete = false;
  try {
    const rr = await client.get(origin + '/robots.txt', { timeout: 20000, maxRedirects: 0 });
    const text = await rr.text();
    if (![200, 404].includes(rr.status()) || /^\s*</.test(text))
      throw Error('UNIQLO_ROBOTS_UNAVAILABLE');
    const rules = robotsParser(origin + '/robots.txt', rr.status() === 404 ? '' : text);
    const delay = Math.max(1600, Number(rules.getCrawlDelay('SteppeSaleCollector') || 0) * 1000);
    if (delay > 60000) throw Error('UNIQLO_CRAWL_DELAY');
    const get = async (path) => {
      let url = base + path;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (Date.now() > deadline) throw Error('UNIQLO_TIME_LIMIT');
        if (!url.startsWith(base + '/') || rules.isAllowed(url, 'SteppeSaleCollector') === false)
          throw Error('UNIQLO_ROBOTS_DISALLOWED');
        await new Promise((ok) => setTimeout(ok, delay * (attempt + 1)));
        const r = await client.get(url, { timeout: 25000, maxRedirects: 0 });
        if ([301, 302, 307, 308].includes(r.status())) {
          url = new URL(r.headers().location, url).href;
          continue;
        }
        if ([401, 403, 429].includes(r.status())) throw Error('UNIQLO_API_HTTP_' + r.status());
        if (!r.ok()) {
          if (attempt === 2) throw Error('UNIQLO_API_HTTP_' + r.status());
          continue;
        }
        const b = await r.body();
        if (b.length > 10000000) throw Error('UNIQLO_RESPONSE_TOO_LARGE');
        const d = JSON.parse(b.toString());
        if (d.status !== 'ok') throw Error('UNIQLO_API_INVALID_STATUS');
        return d;
      }
      throw Error('UNIQLO_API_REDIRECT_LIMIT');
    };
    // Идентификаторы взяты из breadcrumbs официальных товаров; актуальные остальные
    // разделы читаются из aggregations.tree.genders, а не угадываются по номерам.
    const first = await get(
      '/products?path=' + (region === 'jp' ? '1072' : '57893') + '&offset=0&limit=36',
    );
    const genders = first.result?.aggregations?.tree?.genders;
    if (!Array.isArray(genders) || !genders.length || !first.result.pagination.total)
      throw Error('UNIQLO_CATEGORY_SCHEMA_CHANGED');
    const pages = genders
      .filter((g) => /^(men|women|kids|baby)$/i.test(g.name))
      .map((g) => ({ id: g.id, offset: 0, done: false }));
    const seenPages = new Set();
    while (pages.some((p) => !p.done) && Date.now() < deadline && candidates.size < limit) {
      for (const pg of pages.filter((p) => !p.done)) {
        const d =
          String(pg.id) === (region === 'jp' ? '1072' : '57893') && pg.offset === 0
            ? first
            : await get(`/products?path=${pg.id}&offset=${pg.offset}&limit=36`);
        const result = d.result;
        if (
          !Array.isArray(result.items) ||
          !Number.isInteger(result.pagination?.total) ||
          result.pagination.offset !== pg.offset
        )
          throw Error('UNIQLO_PAGINATION_INVALID');
        const fingerprint =
          pg.id + ':' + result.items.map((p) => p.productId + '-' + p.priceGroup).join(',');
        if (result.items.length && seenPages.has(fingerprint)) throw Error('UNIQLO_REPEATED_PAGE');
        seenPages.add(fingerprint);
        for (const p of result.items)
          if (/^E\d{6}-\d{3}$/.test(p.productId) && /^\d{2}$/.test(p.priceGroup))
            candidates.set(p.productId + '-' + p.priceGroup, {
              productId: p.productId,
              priceGroup: p.priceGroup,
            });
        pg.offset += result.items.length;
        pg.done = pg.offset >= result.pagination.total;
        if (!result.items.length && !pg.done) throw Error('UNIQLO_INCOMPLETE_PAGE');
      }
      console.log(
        JSON.stringify({
          source,
          event: 'discovery',
          candidates: candidates.size,
          pages: pages.map((p) => p.offset),
        }),
      );
    }
    for (const p of [...candidates.values()].slice(0, limit)) {
      if (Date.now() > deadline) break;
      try {
        const path = `/products/${p.productId}/price-groups/${p.priceGroup}`;
        const detail = await get(path);
        const stock = await get(path + '/stock');
        for (const product of uniqloProducts(detail, stock, source, p))
          products.set(product.sku, product);
      } catch (e) {
        if (/401|403|429|ROBOTS|TIME_LIMIT/.test(e.message)) throw e;
        errors.push({ sku: p.productId, error: e.message });
      }
      checked++;
      if (checked % 10 === 0) {
        await checkpoint([...products.values()]);
        console.log(JSON.stringify({ source, event: 'details', checked, products: products.size }));
      }
    }
    complete = pages.every((p) => p.done) && checked === candidates.size && !errors.length;
    return {
      products: [...products.values()],
      errors,
      complete,
      discovered: candidates.size,
      checked,
    };
  } finally {
    await client.dispose();
  }
}
