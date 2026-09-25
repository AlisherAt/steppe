import robotsParser from 'robots-parser';
import { canonicalProductUrl, manualSource, productImageHosts } from '../manual-source';
import type { Product } from '../types';
import { toKzt } from '../money';
import { AuthError } from './auth';
import { fetchText, IntegrationError, publicHttps, splitHosts } from './http';
import { loadRates } from './rates';
import { seaStore } from './seatable-store';
import { urlKey } from './manual-products';

type Quote = {
  name: string;
  imageUrl: string | null;
  sku?: string;
  currency: string;
  variants: { size: string; price: string }[];
};
const objects = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.flatMap(objects)
    : value && typeof value === 'object'
      ? [value as Record<string, unknown>, ...objects((value as Record<string, unknown>)['@graph'])]
      : [];
const typeIs = (p: Record<string, unknown>, type: string) =>
  Array.isArray(p['@type']) ? p['@type'].includes(type) : p['@type'] === type;

export function extractLinkQuote(html: string, url: string): Quote {
  const nodes: Record<string, unknown>[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi,
  )) {
    try {
      nodes.push(...objects(JSON.parse(match[1])));
    } catch {
      /* Другие блоки могут быть корректными. */
    }
  }
  const products = nodes.filter((n) => typeIs(n, 'Product') || typeIs(n, 'ProductGroup'));
  const matches = products.filter((p) => {
    try {
      return canonicalProductUrl(new URL(String(p.url), url).href) === url;
    } catch {
      return false;
    }
  });
  const p =
    matches.length === 1
      ? matches[0]
      : products.length === 1 && !products[0].url
        ? products[0]
        : null;
  if (!p || typeof p.name !== 'string')
    throw new AuthError(
      422,
      'Не удалось определить товар. Страница не содержит однозначных данных о модели.',
    );
  const items = typeIs(p, 'ProductGroup') ? objects(p.hasVariant) : [p];
  const variants: Quote['variants'] = [];
  let currency = '';
  for (const item of items) {
    for (const offer of objects(item.offers)) {
      // Диапазон AggregateOffer / lowPrice не является фиксированной ценой размера.
      if (
        !typeIs(offer, 'Offer') ||
        !/^(https?:\/\/schema\.org\/)?InStock$/.test(String(offer.availability))
      )
        continue;
      const price = String(offer.price);
      if (!/^\d{1,8}(\.\d{1,4})?$/.test(price) || Number(price) <= 0) continue;
      const code = String(offer.priceCurrency);
      if (!['USD', 'EUR', 'GBP'].includes(code)) continue;
      if (currency && currency !== code)
        throw new AuthError(422, 'На странице смешаны валюты. Нужна однозначная цена.');
      currency = code;
      const offered = offer.itemOffered as Record<string, unknown> | undefined;
      const sizeValue = offered?.size || offer.size || item.size;
      const size =
        typeof sizeValue === 'string' || typeof sizeValue === 'number'
          ? String(sizeValue).trim()
          : '';
      variants.push({ size, price });
    }
  }
  if (!variants.length)
    throw new AuthError(
      422,
      'Магазин не предоставил фиксированную цену и наличие. Такой товар пока нельзя опубликовать.',
    );
  const unique = [...new Map(variants.map((v) => [JSON.stringify(v), v])).values()];
  if (
    unique.length > 60 ||
    (unique.length > 1 && unique.some((v) => !v.size)) ||
    new Set(unique.map((v) => v.size)).size !== unique.length
  )
    throw new AuthError(422, 'Не удалось связать цены с размерами. Публикация остановлена.');
  const image = Array.isArray(p.image) ? p.image[0] : p.image;
  const imageValue =
    typeof image === 'string'
      ? image
      : image && typeof image === 'object'
        ? (image as Record<string, unknown>).url
        : null;
  const imageUrl = typeof imageValue === 'string' ? new URL(imageValue, url).href : null;
  return {
    name: p.name.trim(),
    imageUrl,
    sku: typeof p.sku === 'string' ? p.sku : undefined,
    currency,
    variants: unique,
  };
}

export async function importProductLink(
  input: string,
): Promise<{ product: Product; from: string }> {
  let source;
  let url;
  try {
    source = manualSource(input);
    url = canonicalProductUrl(input);
  } catch {
    throw new AuthError(
      400,
      'Нужна HTTPS-ссылка на товар поддерживаемого магазина США или Европы.',
    );
  }
  const existing = (await seaStore.liveProducts()).find(
    (p) => canonicalProductUrl(p.productUrl) === url,
  );
  if (existing?.sizePrices?.length)
    return {
      product: { ...existing, sourceUpdatedAt: existing.sourceUpdatedAt || existing.updatedAt },
      from: 'Последняя подтверждённая проверка сборщика',
    };
  const origin = new URL(url).origin;
  let rules = '';
  try {
    rules = await fetchText(origin + '/robots.txt', {
      hosts: [source.host],
      attempts: 1,
      maxBytes: 1_000_000,
    });
  } catch (error) {
    if (!(error instanceof IntegrationError && error.code === 'UPSTREAM_HTTP_404'))
      throw new AuthError(422, 'Не удалось проверить правила доступа магазина. Попробуйте позже.');
  }
  if (/^\s*</.test(rules))
    throw new AuthError(422, 'Магазин вернул проверку доступа вместо robots.txt.');
  const robots = robotsParser(origin + '/robots.txt', rules);
  if (robots.isAllowed(url, 'SteppeDeals') === false)
    throw new AuthError(422, 'Магазин запрещает автоматическое чтение этой страницы.');
  const delay = Number(robots.getCrawlDelay('SteppeDeals') || 0) * 1000;
  if (delay > 10000)
    throw new AuthError(
      422,
      'Эта страница требует длительного интервала запросов. Используйте плановый сбор.',
    );
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  let html: string;
  try {
    html = await fetchText(url, {
      hosts: [source.host],
      attempts: 1,
      maxBytes: 3_000_000,
      headers: { Accept: 'text/html' },
    });
  } catch {
    throw new AuthError(
      422,
      'Магазин не открыл страницу для импорта. Цена не получена; товар не опубликован.',
    );
  }
  if (
    /access denied|verify (?:that )?you are human|verifying your browser|robot check/i.test(
      html.slice(0, 30000),
    )
  )
    throw new AuthError(
      422,
      'Магазин показывает проверку доступа. Автоматическое заполнение недоступно.',
    );
  const quote = extractLinkQuote(html, url);
  if (source.market === 'US' && quote.currency !== 'USD')
    throw new AuthError(
      422,
      'Страница вернула валюту другого региона. Проверьте ссылку на магазин США.',
    );
  let imageUrl = quote.imageUrl;
  if (imageUrl) {
    try {
      publicHttps(imageUrl, [...productImageHosts, ...splitHosts(process.env.PRODUCT_IMAGE_HOSTS)]);
    } catch {
      imageUrl = null;
    }
  }
  const rate = (await loadRates()).find((r) => r.currency === quote.currency);
  if (!rate) throw new AuthError(503, 'Нет актуального курса для валюты магазина.');
  const sizePrices = quote.variants.map((v) => ({
    size: /^\d+(\.\d+)?$/.test(v.size)
      ? `${source.market === 'EU' ? 'EU' : 'US'} ${v.size}`
      : v.size,
    salePrice: v.price,
    saleKzt: toKzt(v.price, rate.value),
  }));
  const cheapest = sizePrices.reduce((a, b) => (a.saleKzt <= b.saleKzt ? a : b));
  const at = new Date().toISOString();
  return {
    from: 'Структурированные данные страницы магазина',
    product: {
      id: urlKey(url),
      externalId: quote.sku || urlKey(url),
      sourceId: `manual-${source.market.toLowerCase()}`,
      sourceName: 'STEPPE',
      brand: source.brand,
      name: quote.name,
      imageUrl,
      productUrl: url,
      sizes: sizePrices.map((v) => v.size),
      sizePrices,
      gender: 'unisex',
      category: 'Кроссовки',
      offerKind: 'retail',
      purchaseType: 'fixed',
      market: source.market,
      sku: quote.sku,
      sourceUpdatedAt: at,
      originalPrice: null,
      salePrice: cheapest.salePrice,
      currency: quote.currency,
      originalKzt: null,
      saleKzt: cheapest.saleKzt,
      discount: 0,
      rate,
      updatedAt: at,
      firstSeenAt: at,
      demo: false,
    },
  };
}
