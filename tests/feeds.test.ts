import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseYml, parseGoogleXml, parseCsvFeed, feedDate } from '../src/lib/server/feed-formats';
import { brandNames, normalizeBrand, brandInTitle } from '../src/lib/brands';
import { PartnerFeedAdapter } from '../src/lib/server/adapters';
import { EbayAdapter, parseEbayResults } from '../src/lib/server/ebay';
import { getAllAdapters as getAdapters } from '../src/lib/server/sources';
import { fetchText } from '../src/lib/server/http';
vi.mock('../src/lib/server/http', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchText: vi.fn(),
}));
const now = new Date('2026-09-24T10:00:00Z');
const yml = (offer: string) =>
  `<yml_catalog date="2026-09-24 12:00"><shop><offers>${offer}</offers></shop></yml_catalog>`;
const offer = `<offer id="a" available="true"><name>Adidas sneakers</name><vendor>adidas originals</vendor><url>https://shop.example/a</url><price>80</price><oldprice>100</oldprice><currencyId>USD</currencyId><param name="Размер" unit="EU">42</param></offer>`;
const google = (extra = '') =>
  `<rss xmlns:g="http://base.google.com/ns/1.0"><channel><item><g:id>a</g:id><g:title>ASICS sneakers</g:title><g:brand>asics</g:brand><g:link>https://shop.example/a</g:link><g:availability>in_stock</g:availability><g:price>100 USD</g:price><g:sale_price>80 USD</g:sale_price><g:size>10</g:size><g:size_system>US</g:size_system>${extra}</item></channel></rss>`;
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe('Бренды и полные партнёрские фиды', () => {
  it('сохраняет срок Google-акции и отклоняет неоднозначные даты', () => {
    const period =
      '<g:sale_price_effective_date>2026-09-24T09:00:00Z/2026-10-01T10:00:00Z</g:sale_price_effective_date>';
    expect(parseGoogleXml(google(period), { now })[0]).toMatchObject({
      saleStartsAt: '2026-09-24T09:00:00Z',
      saleEndsAt: '2026-10-01T10:00:00Z',
    });
    expect(() => parseGoogleXml(google(period.replaceAll('Z', '')), { now })).toThrow(
      'INVALID_SALE_PERIOD',
    );
    expect(parseGoogleXml(google(period), { now: new Date('2026-10-01T10:00:00Z') })).toEqual([]);
  });

  it('распознаёт марки и сохраняет новые без изменения кода', () => {
    expect(brandNames).toHaveLength(78);
    expect(normalizeBrand(' HOKA ONE ONE ')).toBe('HOKA');
    expect(normalizeBrand('adidas Originals')).toBe('Adidas');
    expect(normalizeBrand('New Independent Brand')).toBe('New Independent Brand');
    expect(brandInTitle('Nike running shoes')).toBe('Nike');
    expect(brandInTitle('running on clouds sneakers')).toBeNull();
  });
  it('принимает YML с минутной датой и явными EU размерами', () => {
    expect(parseYml(yml(offer), { now, timezone: '+03:00' })[0]).toMatchObject({
      brand: 'Adidas',
      sizes: ['42'],
      salePrice: '80',
    });
  });
  it('не угадывает часовой пояс или US размер и отвергает старую дату', () => {
    expect(() => parseYml(yml(offer), { now })).toThrow('FEED_TIMEZONE_REQUIRED');
    expect(
      parseYml(yml(offer.replace('unit="EU"', 'unit="US"')), {
        now,
        timezone: '+03:00',
        euSizes: true,
      })[0],
    ).toMatchObject({ sizes: [] });
    expect(() => feedDate('2020-01-01T00:00:00Z', { now })).toThrow('STALE_FEED');
  });
  it('пропускает недоступные товары и отклоняет повреждённый/пустой YML', () => {
    expect(
      parseYml(yml(offer.replace('available="true"', 'available="false"')), {
        now,
        timezone: '+03:00',
      }),
    ).toEqual([]);
    expect(() => parseYml('<!DOCTYPE x><broken>')).toThrow();
    expect(() => parseYml(yml(''), { now, timezone: '+03:00' })).toThrow('EMPTY_FEED');
    expect(parseYml(yml(''), { now, timezone: '+03:00', allowEmpty: true })).toEqual([]);
  });
  it('читает Google XML, страны доставки и срок скидки', () => {
    expect(
      parseGoogleXml(google('<g:shipping><g:country>KZ</g:country></g:shipping>'), { now })[0],
    ).toMatchObject({ sizes: [], deliveryCountries: ['KZ'] });
    expect(
      parseGoogleXml(
        google(
          '<g:sale_price_effective_date>2026-01-01T00:00:00Z/2026-02-01T00:00:00Z</g:sale_price_effective_date>',
        ),
        { now },
      ),
    ).toEqual([]);
    expect(() => parseGoogleXml(google().replace('80 USD', '80 EUR'), { now })).toThrow(
      'INVALID_FEED_PRICE',
    );
  });
  it('читает quoted CSV и не выдаёт рекомендованную цену за скидку', () => {
    const csv =
      'merchant_product_id,product_name,brand_name,search_price,product_price_old,rrp_price,currency,in_stock,last_updated,merchant_deep_link\na,"Nike sneakers, blue",Nike,80,100,120,USD,1,2026-09-24T08:00:00Z,https://shop.example/a';
    expect(parseCsvFeed(csv, 'awin-csv', { now })[0]).toMatchObject({
      name: 'Nike sneakers, blue',
      originalPrice: '100',
    });
    expect(parseCsvFeed(csv.replace('80,100,120', '80,,120'), 'awin-csv', { now })).toEqual([]);
    expect(() => parseCsvFeed('broken,header\nx,y', 'awin-csv')).toThrow('INVALID_CSV');
  });
  it('читает Google CSV и отклоняет неполные строки XML', () => {
    expect(
      parseCsvFeed(
        'id,title,brand,link,availability,price,sale_price,size,size_system\na,ASICS sneakers,ASICS,https://shop.example/a,in_stock,100 USD,70 USD,42,EU',
        'google-csv',
      )[0],
    ).toMatchObject({ sizes: ['42'], salePrice: '70' });
    expect(() => parseGoogleXml(google().replace('<g:id>a</g:id>', ''))).toThrow(
      'INCOMPLETE_FEED_ROW',
    );
  });
  it('добавляет магазин настройкой и отклоняет повтор ID', () => {
    vi.stubEnv(
      'ADDITIONAL_SOURCES_JSON',
      '[{"id":"foreign-shop","name":"Shop","prefix":"SHOP","format":"yml"}]',
    );
    expect(getAdapters().find((a) => a.id === 'foreign-shop')).toBeDefined();
    vi.stubEnv('ADDITIONAL_SOURCES_JSON', '[{"id":"nike","name":"Shop","prefix":"SHOP"}]');
    expect(() => getAdapters()).toThrow('DUPLICATE_SOURCE_ID');
  });
});
describe('Региональный импорт и eBay', () => {
  const item = {
    itemId: 'v1|1|0',
    title: 'Nike running shoes',
    itemWebUrl: 'https://www.ebay.com/itm/1',
    price: { value: '80', currency: 'USD' },
    marketingPrice: { originalPrice: { value: '100', currency: 'USD' }, priceTreatment: 'STP' },
    conditionId: '1000',
    buyingOptions: ['FIXED_PRICE'],
    seller: { feedbackPercentage: '99.5', feedbackScore: 500 },
  };
  it('импортирует скидку STP и сохраняет основание доставки', () => {
    expect(parseEbayResults({ total: 1, itemSummaries: [item] }, now)[0]).toMatchObject({
      brand: 'Nike',
      sizes: [],
      delivery: { country: 'KZ', basis: 'ebay-filter' },
    });
  });
  it('исключает MAP, неизвестный рейтинг, низкий рейтинг и б/у', () => {
    for (const bad of [
      { ...item, marketingPrice: { ...item.marketingPrice, priceTreatment: 'MAP' } },
      { ...item, seller: undefined },
      { ...item, seller: { feedbackPercentage: '90', feedbackScore: 50 } },
      { ...item, conditionId: '3000' },
    ])
      expect(parseEbayResults({ total: 1, itemSummaries: [bad] }, now)).toEqual([]);
    expect(() => parseEbayResults({ total: 2 })).toThrow('INCOMPLETE_EBAY');
  });
  it('получает токен автоматически и отправляет фильтр доставки KZ', async () => {
    vi.stubEnv('EBAY_CLIENT_ID', 'test-client');
    vi.stubEnv('EBAY_CLIENT_SECRET', 'test-secret');
    vi.stubEnv('EBAY_API_PERMISSION', 'fixture-only');
    vi.mocked(fetchText)
      .mockResolvedValueOnce(JSON.stringify({ access_token: 'fixture-token', expires_in: 7200 }))
      .mockResolvedValue(JSON.stringify({ total: 1, itemSummaries: [item] }));
    const adapter = new EbayAdapter();
    expect(await adapter.fetchProducts()).toHaveLength(1);
    expect(await adapter.fetchProducts()).toHaveLength(1);
    expect(fetchText).toHaveBeenCalledTimes(3);
    const queryUrl = new URL(vi.mocked(fetchText).mock.calls[1][0]);
    expect(queryUrl.searchParams.get('filter')).toContain('deliveryCountry:KZ');
  });
  it('требует подтверждённый свежий KZ экспорт и исключает явно чужие страны', async () => {
    for (const [k, v] of Object.entries({
      SHOP_FEED_URL: 'https://feed.example/catalog',
      SHOP_FEED_HOSTS: 'feed.example',
      SHOP_FEED_PERMISSION: 'test',
      SHOP_PRODUCT_HOSTS: 'shop.example',
      SHOP_DELIVERY_POLICY_URL: 'https://shop.example/shipping',
      SHOP_FEED_FRESHNESS_CONFIRMED: 'true',
    }))
      vi.stubEnv(k, v);
    const adapter = new PartnerFeedAdapter('shop', 'Shop', 'SHOP', 'test');
    expect(adapter.configured()).toBe(false);
    vi.stubEnv('SHOP_FEED_KZ_ONLY', 'true');
    const p = {
      id: 'a',
      brand: 'Nike',
      name: 'Sneakers',
      productUrl: 'https://shop.example/a',
      originalPrice: '100',
      salePrice: '80',
      currency: 'USD',
    };
    vi.mocked(fetchText).mockResolvedValue(
      JSON.stringify({
        version: 1,
        complete: true,
        generatedAt: new Date().toISOString(),
        products: [
          p,
          { ...p, id: 'b', productUrl: 'https://shop.example/b', deliveryCountries: ['US'] },
        ],
      }),
    );
    const products = await adapter.fetchProducts();
    expect(products).toHaveLength(1);
    expect(products[0].delivery).toMatchObject({ country: 'KZ', basis: 'merchant-feed' });
  });
});
