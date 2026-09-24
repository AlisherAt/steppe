import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { IntegrationError } from './http';
import { normalizeBrand } from '../brands';

export type FeedFormat = 'json' | 'yml' | 'awin-csv' | 'google-csv' | 'google-xml';
export type ParseOptions = {
  timezone?: string;
  euSizes?: boolean;
  categoryPattern?: string;
  allowEmpty?: boolean;
  now?: Date;
};
type Row = Record<string, unknown>;
const array = (value: unknown): Row[] =>
  value === undefined || value === '' ? [] : ((Array.isArray(value) ? value : [value]) as Row[]);
const str = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const money = (value: unknown) => str(value).replace(',', '.');
export function feedDate(value: unknown, options: ParseOptions): string {
  let text = str(value).replace(' ', 'T');
  text = text.replace(/(T\d{2}:\d{2})(?=Z|[+-]|$)/, '$1:00');
  if (!text) throw new IntegrationError('FEED_DATE_MISSING');
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(text)) {
    if (!options.timezone || !/^[+-]\d{2}:\d{2}$/.test(options.timezone))
      throw new IntegrationError('FEED_TIMEZONE_REQUIRED');
    text += options.timezone;
  }
  const parsed = z.string().datetime({ offset: true }).safeParse(text);
  const age = (options.now || new Date()).getTime() - Date.parse(text);
  if (!parsed.success || !Number.isFinite(age) || age < -3600000 || age > 36 * 3600000)
    throw new IntegrationError('STALE_FEED');
  return text;
}
function xml(text: string): Row {
  if (/<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true)
    throw new IntegrationError('INVALID_FEED_XML');
  return new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    removeNSPrefix: true,
  }).parse(text);
}
function gender(value: unknown) {
  const v = str(value).toLowerCase();
  if (/^(female|women|женский|женские)$/.test(v)) return 'women';
  if (/^(male|men|мужской|мужские)$/.test(v)) return 'men';
  if (/^(kids|children|детский|детские)$/.test(v)) return 'kids';
  return 'unisex';
}
function sizes(value: unknown, eu: boolean) {
  return eu
    ? str(value)
        .split(/[|;,]/)
        .map((v) => v.trim())
        .filter(Boolean)
    : [];
}
function isSneaker(name: string, category: string, options: ParseOptions): boolean {
  if (options.categoryPattern)
    return category
      .toLocaleLowerCase('ru')
      .includes(options.categoryPattern.toLocaleLowerCase('ru'));
  const text = `${name} ${category}`;
  return (
    /кроссов|кеды|\bsneakers?\b|\btrainers?\b|\b(?:running|tennis|basketball|skate|trail|athletic) shoes?\b/i.test(
      text,
    ) && !/шнурк|стельк|носки|носков|shoelaces|insoles|\bsocks?\b/i.test(name)
  );
}
function discount(old: unknown, sale: unknown): boolean {
  if (!str(old)) return false;
  try {
    const o = new Decimal(money(old)),
      s = new Decimal(money(sale));
    if (!o.isFinite() || !s.isFinite() || s.lte(0) || o.lte(0)) throw new Error();
    return o.gt(s);
  } catch {
    throw new IntegrationError('INVALID_FEED_PRICE');
  }
}
function checkedRows(rows: Row[], options: ParseOptions): Row[] {
  if (rows.length > 20000) throw new IntegrationError('FEED_TOO_MANY_ROWS');
  if (!rows.length && !options.allowEmpty) throw new IntegrationError('EMPTY_FEED_REQUIRES_OPT_IN');
  return rows;
}
export function parseYml(text: string, options: ParseOptions = {}): unknown[] {
  const root = xml(text).yml_catalog as Row | undefined;
  if (!root || typeof root.shop !== 'object') throw new IntegrationError('INVALID_YML');
  feedDate(root['@_date'], options);
  const shop = root.shop as Row;
  if (!('offers' in shop)) throw new IntegrationError('INCOMPLETE_FEED');
  const categories = new Map(
    array((shop.categories as Row)?.category).map((c) => [str(c['@_id']), str(c['#text'])]),
  );
  return checkedRows(array((shop.offers as Row)?.offer), options).flatMap((p) => {
    const name =
      str(p.name) || [str(p.typePrefix), str(p.vendor), str(p.model)].filter(Boolean).join(' ');
    const category = categories.get(str(p.categoryId)) || '';
    if (
      !isSneaker(name, category, options) ||
      str(p['@_available']) !== 'true' ||
      p.condition ||
      !discount(p.oldprice, p.price)
    )
      return [];
    const params = array(p.param);
    const param = (pattern: RegExp) => params.find((v) => pattern.test(str(v['@_name'])));
    const size = param(/^(размер|size|размер EU|EU size)$/i);
    const sizeUnit = str(size?.['@_unit']);
    const explicitEu = /EU|EUR/i.test(sizeUnit) || /EU/i.test(str(size?.['@_name']));
    return [
      {
        id: str(p['@_id']),
        brand: normalizeBrand(str(p.vendor)),
        name,
        productUrl: str(p.url),
        imageUrl: str(Array.isArray(p.picture) ? p.picture[0] : p.picture) || null,
        originalPrice: money(p.oldprice),
        salePrice: money(p.price),
        currency: str(p.currencyId) === 'RUR' ? 'RUB' : str(p.currencyId),
        sizes: sizes(size?.['#text'], explicitEu || (!sizeUnit && Boolean(options.euSizes))),
        gender: gender(param(/^(пол|gender)$/i)?.['#text']),
        category: 'Кроссовки',
        available: true,
        deliveryCountries: p.deliveryCountries
          ? str(p.deliveryCountries)
              .split(/[,;|]/)
              .map((v) => v.trim().toUpperCase())
          : undefined,
      },
    ];
  });
}
function googleRows(rows: Row[], options: ParseOptions): unknown[] {
  return checkedRows(rows, options).flatMap((p) => {
    if (!str(p.id) || !str(p.title) || !str(p.link) || !str(p.availability))
      throw new IntegrationError('INCOMPLETE_FEED_ROW');
    const name = str(p.title),
      category = str(p.product_type) || str(p.google_product_category);
    if (
      !isSneaker(name, category, options) ||
      str(p.availability) !== 'in_stock' ||
      (p.condition && str(p.condition) !== 'new')
    )
      return [];
    const sale = str(p.sale_price).match(/^(\d+(?:\.\d+)?)\s+([A-Z]{3})$/),
      old = str(p.price).match(/^(\d+(?:\.\d+)?)\s+([A-Z]{3})$/);
    if (!p.sale_price) return [];
    if (!sale || !old || sale[2] !== old[2]) throw new IntegrationError('INVALID_FEED_PRICE');
    if (!discount(old[1], sale[1])) return [];
    let saleStartsAt: string | undefined, saleEndsAt: string | undefined;
    if (p.sale_price_effective_date) {
      const [start, end] = str(p.sale_price_effective_date).split('/');
      const now = (options.now || new Date()).getTime();
      if (
        !z.string().datetime({ offset: true }).safeParse(start).success ||
        !z.string().datetime({ offset: true }).safeParse(end).success ||
        Date.parse(start) >= Date.parse(end)
      )
        throw new IntegrationError('INVALID_SALE_PERIOD');
      if (now < Date.parse(start) || now >= Date.parse(end)) return [];
      saleStartsAt = start;
      saleEndsAt = end;
    }
    const system = str(p.size_system).toUpperCase();
    return [
      {
        id: str(p.id),
        brand: normalizeBrand(str(p.brand)),
        name,
        productUrl: str(p.link),
        imageUrl: str(p.image_link) || null,
        originalPrice: old[1],
        salePrice: sale[1],
        currency: sale[2],
        ...(saleStartsAt ? { saleStartsAt } : {}),
        ...(saleEndsAt ? { saleEndsAt } : {}),
        sizes: sizes(p.size, system === 'EU' || (!system && Boolean(options.euSizes))),
        gender: gender(p.gender),
        category: 'Кроссовки',
        available: true,
        deliveryCountries: p.shipping
          ? array(p.shipping)
              .map((s) => str(s.country).toUpperCase())
              .filter(Boolean)
          : undefined,
      },
    ];
  });
}
export function parseGoogleXml(text: string, options: ParseOptions = {}): unknown[] {
  const root = xml(text);
  const channel = (root.rss as Row)?.channel as Row | undefined;
  if (!channel) throw new IntegrationError('INVALID_GOOGLE_XML');
  // Google feeds do not require a timestamp: operator must attest a continuously refreshed endpoint.
  return googleRows(array(channel.item), options);
}
export function parseCsvFeed(
  text: string,
  format: 'awin-csv' | 'google-csv',
  options: ParseOptions = {},
): unknown[] {
  let rows: Row[];
  try {
    rows = parse(text, {
      columns: true,
      bom: true,
      skip_empty_lines: true,
      max_record_size: 100000,
      relax_column_count: false,
      to: 20001,
    });
    const required =
      format === 'awin-csv'
        ? ['product_name', 'search_price', 'currency', 'in_stock', 'brand_name']
        : ['id', 'title', 'link', 'availability', 'price'];
    if (rows.length && required.some((key) => !(key in rows[0]))) throw new Error('columns');
  } catch {
    throw new IntegrationError('INVALID_CSV');
  }
  if (format === 'google-csv') return googleRows(rows, options);
  return checkedRows(rows, options).flatMap((p) => {
    const name = str(p.product_name),
      category = [str(p.merchant_category), str(p.category_name)].join(' ');
    if (
      !isSneaker(name, category, options) ||
      !['1', 'true', 'yes'].includes(str(p.in_stock).toLowerCase())
    )
      return [];
    if (p.condition && !['new', 'новый'].includes(str(p.condition).toLowerCase())) return [];
    // rrp_price is a recommended price, not evidence of an actual previous selling price.
    if (!discount(p.product_price_old, p.search_price)) return [];
    if (!p.last_updated) throw new IntegrationError('FEED_DATE_MISSING');
    feedDate(p.last_updated, options);
    if (
      p.valid_to &&
      Number.isFinite(Date.parse(str(p.valid_to))) &&
      Date.parse(str(p.valid_to)) <= (options.now || new Date()).getTime()
    )
      return [];
    return [
      {
        id: str(p.merchant_product_id) || str(p.aw_product_id),
        brand: normalizeBrand(str(p.brand_name)),
        name,
        productUrl: str(p.aw_deep_link) || str(p.merchant_deep_link),
        imageUrl: str(p.merchant_image_url) || str(p.aw_image_url) || null,
        originalPrice: money(p.product_price_old),
        salePrice: money(p.search_price),
        currency: str(p.currency),
        sizes: [],
        gender: gender(p.gender),
        category: 'Кроссовки',
        available: true,
      },
    ];
  });
}
