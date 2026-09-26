import robotsParser from 'robots-parser';
import { price } from '../scraper-extract.mjs';

export const AGENT_REACH_REVISION = 'a19a171fa980a0785849596492e0af4db800c82f';
const agent = 'SteppeSaleCollector';

export function storeUrl(value, source, { listing = false } = {}) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.origin !== new URL(source.url).origin ||
      url.username ||
      url.password ||
      url.search ||
      /%|\\/.test(url.pathname)
    )
      return null;
    url.hash = '';
    const product =
      source.id === 'adidas'
        ? /^\/us\/[^/]+\/[A-Z0-9]{6}\.html$/.test(url.pathname)
        : /^\/t\/[^/]+(?:\/[A-Z0-9]{6}-\d{3})?$/.test(url.pathname);
    return product || (listing && url.href === source.url) ? url.href : null;
  } catch {
    return null;
  }
}

export function productLinks(markdown, source) {
  const urls = [...markdown.matchAll(/https:\/\/[^\s<>"\]\)]+/g)].map((match) =>
    storeUrl(match[0], source),
  );
  return [...new Set(urls.filter(Boolean))].slice(0, 200);
}

// Jina может ответить HTTP 200, вложив ошибку магазина в Markdown.
// Такие страницы НЕ являются успешным сбором, даже если содержат карточки.
export function validateReaderPage(markdown, url) {
  if (typeof markdown !== 'string' || markdown.length > 5 * 1024 * 1024)
    throw Error('INVALID_READER_BODY');
  const warning = /Target URL returned error\s+(\d{3})/i.exec(markdown);
  if (warning) throw Error(`TARGET_HTTP_${warning[1]}`);
  if (
    /requiring captcha|access denied|verify (?:that )?you are human|unusual traffic|robot check|title: just a moment|security verification|checking your browser/i.test(
      markdown,
    )
  )
    throw Error('ACCESS_CHALLENGE');
  const original = /^URL Source:\s*(\S+)/m.exec(markdown)?.[1];
  if (!original || new URL(original).href !== new URL(url).href)
    throw Error('READER_SOURCE_MISMATCH');
  if (/^Warning:/im.test(markdown)) throw Error('READER_WARNING');
  if (!markdown.includes('Markdown Content:')) throw Error('INVALID_READER_FORMAT');
  if (
    /^Title:\s*https?:\/\//im.test(markdown) ||
    /1x1 image|tacker probe|tracker probe/i.test(markdown)
  )
    throw Error('READER_NOT_STORE_PAGE');
}

export function robotsPolicy(body, status, source) {
  if ((status < 200 || status >= 300) && status !== 404) throw Error(`ROBOTS_HTTP_${status}`);
  if (body.length > 1_000_000 || /^\s*</.test(body)) throw Error('INVALID_ROBOTS');
  const robots = robotsParser(new URL('/robots.txt', source.url).href, status === 404 ? '' : body);
  const delay = Math.max(2000, Number(robots.getCrawlDelay(agent) || 0) * 1000);
  if (!Number.isFinite(delay) || delay > 60_000) throw Error('CRAWL_DELAY_TOO_LONG');
  return {
    delay,
    allows: (url) =>
      Boolean(storeUrl(url, source, { listing: true })) &&
      robots.isAllowed(url, agent) !== false &&
      robots.isAllowed(url, 'JinaReader') !== false,
  };
}

// Подписи / зачёркивание; для Nike — порядок sale, retail и проверенный процент скидки.
// Не определяем роли двух цен через min/max.
export function extractObservation(markdown, source, url, checkedAt) {
  validateReaderPage(markdown, url);
  if (!storeUrl(url, source)) throw Error('INVALID_PRODUCT_URL');
  const body = markdown.split('Markdown Content:')[1];
  const headers = [...body.matchAll(/^#\s+([^\n]+)/gm)];
  const titleMatch =
    headers.find((m) => !/^(?:error|sorry|something went wrong)$/i.test(m[1].trim())) ||
    /^##\s+(?!Error\s*$)([^\n]+)/m.exec(body);
  const title = titleMatch?.[1]?.trim();
  const main = titleMatch
    ? body
        .slice(titleMatch.index)
        .split(/(?:Select Size|You Might Also Like|Recommended For You|Reviews)/i)[0]
    : '';
  const sku =
    source.id === 'adidas'
      ? /\/([A-Z0-9]{6})\.html$/.exec(url)?.[1]
      : /\/([A-Z0-9]{6}-\d{3})$/.exec(url)?.[1] ||
        /\bStyle:\s*([A-Z0-9]{6}-\d{3})\b/.exec(body)?.[1];
  const amount = '(\\$[^\\n]+)';
  const old =
    new RegExp('^(?:Original Price|Regular Price|Retail Price)[: \\t]*' + amount + '$', 'im').exec(
      main,
    )?.[1] || /~~(\$[\d,]+(?:\.\d{1,2})?)~~/.exec(main)?.[1];
  const sale = new RegExp(
    '^(?:Sale Price|Discounted Price|Current Price)[: \\t]*' + amount + '$',
    'im',
  ).exec(main)?.[1];
  let oldPrice = price(old),
    salePrice = price(sale);
  const pair =
    source.id === 'nike' &&
    /^\s*(\$[\d,]+(?:\.\d{1,2})?)\s*(\$[\d,]+(?:\.\d{1,2})?)\s+(\d{1,2})% off\s*$/im.exec(main);
  if (pair && oldPrice === null && salePrice === null) {
    const current = price(pair[1]),
      retail = price(pair[2]);
    if (
      current &&
      retail &&
      current < retail &&
      Math.abs((1 - current / retail) * 100 - Number(pair[3])) < 1
    ) {
      salePrice = current;
      oldPrice = retail;
    }
  }
  const images = [...body.matchAll(/!\[[^\]]*\]\((https:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g)];
  const image = images
    .map((m) => m[1])
    .sort((a, b) => Number(/t_web_pdp/.test(b)) - Number(/t_web_pdp/.test(a)))
    .find((value) => {
      try {
        const u = new URL(value);
        return (
          !u.username &&
          !u.password &&
          u.origin ===
            (source.id === 'adidas' ? 'https://assets.adidas.com' : 'https://static.nike.com')
        );
      } catch {
        return false;
      }
    });
  const section = titleMatch
    ? body.slice(titleMatch.index).split(/View Product Details|Reviews|You Might Also Like/i)[0]
    : '';
  const soldOut = /Sold Out:|product is currently unavailable/i.test(section);
  const incomplete = /error loading this page|something went wrong/i.test(section);
  const sizeSection =
    section.split('Select Size')[1]?.split(/Add to Bag|Favorite|Shipping/)[0] || '';
  const sizes = [
    ...new Set(
      sizeSection
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => /^(?:[MWK] )?\d+(?:\.\d+)?(?: \/ [MWK] \d+(?:\.\d+)?)?$/.test(s)),
    ),
  ].slice(0, 60);
  const shoes =
    /\bshoes|sneakers|trainers\b/i.test(section) &&
    !/\bslides|sandals|hoodie|shirt\b/i.test(title || '');
  const complete = Boolean(
    sku &&
    title &&
    image &&
    oldPrice &&
    salePrice &&
    salePrice < oldPrice &&
    shoes &&
    !soldOut &&
    !incomplete,
  );
  return {
    source: source.id,
    brand: source.brand,
    sku: sku || null,
    name: title || null,
    image_url: image || null,
    product_url: url,
    old_price: oldPrice,
    sale_price: salePrice,
    currency: 'USD',
    checked_at: checkedAt,
    size_price_verified: false,
    freshness_verified: false,
    complete_candidate: complete,
    size_candidates: sizes.map((size) => `US ${size}`),
    availability: soldOut ? 'sold_out' : 'unverified',
    reason: soldOut
      ? 'SOLD_OUT'
      : incomplete
        ? 'INCOMPLETE_PAGE'
        : complete
          ? 'REQUIRES_LIVE_SIZE_PRICE_VERIFICATION'
          : 'INCOMPLETE_PRODUCT_DATA',
  };
}

export async function collectSource(
  source,
  { read, robots, savePage, wait, limit = 3, now = () => new Date().toISOString() },
) {
  /** @type {ReturnType<typeof extractObservation>[]} */
  const observations = [];
  /** @type {ReturnType<typeof extractObservation>[]} */
  const products = [];
  const result = {
    source: source.id,
    brand: source.brand,
    status: 'error',
    count: 0,
    discoveredLinks: 0,
    observations,
    products,
    lastSuccessfulCheck: null,
  };
  try {
    const rules = await robots(source);
    const policy = robotsPolicy(rules.body, rules.status, source);
    if (!policy.allows(source.url)) throw Error('ROBOTS_DISALLOWED');
    await wait(policy.delay);
    const listing = await read(source.url);
    await savePage('listing', listing.markdown);
    // Даже ссылки на карточки с заблокированной страницы не идут в очередь обхода.
    validateReaderPage(listing.markdown, source.url);
    result.readerVersion = listing.version;
    const links = productLinks(listing.markdown, source);
    result.discoveredLinks = links.length;
    // Первые карточки Nike часто являются расцветками одной модели. Берём разные модели.
    const models = new Map();
    for (const url of links) {
      const key = new URL(url).pathname.split('/')[2];
      if (!models.has(key)) models.set(key, url);
    }
    for (const [index, url] of [...models.values()].slice(0, limit).entries()) {
      if (!policy.allows(url)) throw Error('ROBOTS_DISALLOWED');
      await wait(policy.delay);
      const detail = await read(url);
      await savePage(`product-${index + 1}`, detail.markdown);
      const observed = extractObservation(detail.markdown, source, url, now());
      result.observations.push(observed);
      if (observed.complete_candidate) result.products.push(observed);
    }
    result.count = result.products.length;
    result.status = result.count ? 'partial' : 'no_valid_products';
    result.lastSuccessfulCheck = now();
  } catch (error) {
    result.error = /^[A-Z_]+(?:_\d{3})?$/.test(error.message)
      ? error.message
      : 'SOURCE_READ_FAILED';
    // При блокировке/ошибке всего прохода ранее собранные сведения остаются наблюдениями.
    result.products = [];
    result.count = 0;
  }
  return result;
}
