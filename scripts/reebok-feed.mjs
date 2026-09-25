import { sneakerName } from './sale-catalog.mjs';

const amount = (v) =>
  /^\d{1,7}(?:\.\d{1,2})?$/.test(String(v)) && Number(v) > 0 ? Number(v).toFixed(2) : null;
export function reebokPublicProduct(p, currency, now = new Date().toISOString()) {
  if (currency !== 'USD') throw Error('REEBOK_CURRENCY_MISMATCH');
  if (
    p.vendor !== 'Reebok' ||
    p.product_type !== 'Shoes' ||
    !sneakerName(p.title) ||
    !p.published_at
  )
    return null;
  const description = p.title + ' ' + (p.tags || []).join(' ');
  const gender = /women|female/i.test(description)
    ? 'women'
    : /kids|junior|youth|toddler|boys|girls/i.test(description)
      ? 'kids'
      : /\bmen\b|male/i.test(description)
        ? 'men'
        : 'unisex';
  const sizeOption = p.options?.find((o) => /^size$/i.test(o.name));
  if (!sizeOption || ![1, 2, 3].includes(sizeOption.position))
    throw Error('REEBOK_SIZE_OPTION_MISSING');
  const styles = new Set(p.variants.map((v) => /^\d{9}(?=-|$)/.exec(v.sku || '')?.[0]));
  // Product ID остаётся подлинным идентификатором магазина, если общего Style ID нет.
  const sku = styles.size === 1 && !styles.has(undefined) ? [...styles][0] : String(p.id);
  const variants = [];
  for (const v of p.variants || []) {
    if (v.available !== true || v.requires_selling_plan) continue;
    const sale = amount(v.price),
      old = amount(v.compare_at_price);
    if (!sale || !old || Number(sale) >= Number(old)) continue;
    const label = String(v['option' + sizeOption.position] || '').trim();
    const m = /^M (\d+(?:\.\d+)?)(?:\s*\/|$)/.exec(label),
      w = /^W (\d+(?:\.\d+)?)(?:\s*\/|$)/.exec(label);
    const numeric = /^\d+(?:\.\d+)?$/.test(label);
    const size = m
      ? `US M ${m[1]}`
      : w
        ? `US W ${w[1]}`
        : numeric
          ? `US ${gender === 'women' ? 'W ' : gender === 'kids' ? 'K ' : gender === 'men' ? 'M ' : ''}${label}`
          : null;
    if (size)
      variants.push({
        id: String(v.id),
        size,
        salePrice: sale,
        originalPrice: old,
        available: true,
        checkedAt: now,
      });
  }
  if (!variants.length) return null;
  if (new Set(variants.map((v) => v.size)).size !== variants.length)
    throw Error('REEBOK_AMBIGUOUS_VARIANTS');
  const image = p.images?.[0]?.src;
  if (!image || !['www.reebok.com', 'cdn.shopify.com'].includes(new URL(image).hostname))
    throw Error('REEBOK_IMAGE_MISSING');
  if (!/^[a-z0-9-]+$/.test(p.handle)) throw Error('REEBOK_HANDLE_INVALID');
  return {
    source: 'reebok',
    brand: 'Reebok',
    sku,
    name: p.title,
    image_url: image,
    product_url: `https://www.reebok.com/products/${p.handle}`,
    currency: 'USD',
    gender,
    size_price_verified: true,
    variants,
    old_price: Math.max(...variants.map((v) => Number(v.originalPrice))),
    sale_price: Math.min(...variants.map((v) => Number(v.salePrice))),
    checked_at: now,
  };
}

export async function collectReebokPublicFeed(
  page,
  source,
  { allowed, checkAccess, delay, deadline, checkpoint = async () => {} },
) {
  await checkAccess();
  await page.waitForFunction(() => window.Shopify?.currency?.active, {}, { timeout: 10000 });
  const currency = await page.evaluate(() => window.Shopify?.currency?.active);
  if (currency !== 'USD') throw Error('REEBOK_CURRENCY_MISMATCH');
  const products = new Map(),
    seen = new Set(),
    errors = [];
  let pages = 0,
    complete = false,
    observed = 0;
  for (let index = 1; index <= 30 && Date.now() < deadline; index++) {
    const url = new URL('/collections/sale/products.json', source.url);
    url.searchParams.set('limit', '250');
    url.searchParams.set('page', String(index));
    if (!allowed(url.href)) throw Error('FEED_ROBOTS_DISALLOWED');
    await page.waitForTimeout(Math.max(delay, 1800));
    const response = await page
      .context()
      .request.get(url.href, { timeout: 25000, maxRedirects: 0 });
    if (!response.ok()) throw Error(`FEED_HTTP_${response.status()}`);
    const buffer = await response.body();
    if (buffer.length > 8_000_000) throw Error('FEED_TOO_LARGE');
    const data = JSON.parse(buffer.toString('utf8'));
    if (!Array.isArray(data.products)) throw Error('INVALID_REEBOK_FEED');
    pages++;
    for (const raw of data.products) {
      if (seen.has(String(raw.id))) throw Error('REPEATED_FEED_PAGE');
      seen.add(String(raw.id));
      observed++;
      try {
        const product = reebokPublicProduct(raw, currency);
        if (product) products.set(product.sku, product);
      } catch (e) {
        errors.push({ id: String(raw.id), code: e.message });
      }
    }
    console.log(
      JSON.stringify({
        source: 'reebok',
        event: 'public_feed',
        page: index,
        observed,
        verified: products.size,
        errors: errors.length,
      }),
    );
    await checkpoint([...products.values()], {
      observed,
      attempted: observed,
      errors,
      pages,
      method: 'public-collection-json',
    });
    if (data.products.length < 250) {
      complete = true;
      break;
    }
  }
  await checkAccess();
  return {
    products: [...products.values()],
    expected: observed,
    observed,
    candidates: observed,
    attempted: observed,
    errors,
    pages,
    discoveryComplete: complete,
    complete: complete && !errors.length,
  };
}
