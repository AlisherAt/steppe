import { expect, test } from 'vitest';
import { gzipSync } from 'node:zlib';
import fixture from './fixtures/nike-product.json';
import {
  verifiedNikeProduct,
  nikeSaleCandidates,
  nikeProductUrl,
} from '../scripts/nike-products.mjs';
import { nikeEuSize } from '../src/lib/nike-sizes.mjs';
import { retailScrapeProduct } from '../src/lib/server/scraped-retail';
import { scrapeReportSchema } from '../src/lib/server/scrape-report';
import { toProduct } from '../src/lib/server/adapters';
import { withSellingPrices } from '../src/lib/selling-price';
import { decodeScrapeBody, maxScrapeWireBytes } from '../src/lib/scrape-transfer';
const url = 'https://www.nike.com/t/air-jordan-og-womens-shoes-6JW206/CW0907-002';

test('Nike: принимаются только загруженные InStock-варианты, цена для сотрудников не используется', () => {
  const p = verifiedNikeProduct(fixture, url)!;
  expect(p.variants).toHaveLength(13);
  expect(p.sale_price).toBe(87.97);
  expect(p.variants[0]).toMatchObject({
    size: 'EU 35.5',
    sourceSize: 'W 5 / M 3.5',
    salePrice: '87.97',
    originalPrice: '155.00',
  });
  expect(p.variants.some((v) => v.sourceSize === 'W 10.5 / M 9')).toBe(false);
  expect(
    scrapeReportSchema.safeParse({
      runId: 'nike-test',
      checkedAt: new Date().toISOString(),
      published: 0,
      reports: [{ source: 'nike', brand: 'Nike', status: 'partial', count: 1 }],
      products: [p],
    }).success,
  ).toBe(true);
  const feed = retailScrapeProduct(p)!;
  const at = new Date().toISOString();
  const converted = withSellingPrices(
    toProduct(feed, { id: 'nike-us', name: 'Nike US' }, [
      { currency: 'USD', value: '500', source: 'test', asOf: at, fetchedAt: at },
    ]),
  );
  expect(converted.saleKzt).toBe(51000);
  expect(converted.sizes).toContain('EU 35.5');
});

test('не считает размеры из серверного HTML подтверждённым наличием', () => {
  const copy = structuredClone(fixture);
  for (const v of copy.structuredData[0].hasVariant)
    delete (v.offers as { availability?: string }).availability;
  expect(verifiedNikeProduct(copy, url)).toBeNull();
  expect(verifiedNikeProduct({ ...fixture, canAdd: false }, url)).toBeNull();
});

test('обрабатывает массив JSON-LD внутри script и @graph', () => {
  expect(
    verifiedNikeProduct({ ...fixture, structuredData: [fixture.structuredData] }, url)?.variants,
  ).toHaveLength(13);
  expect(
    verifiedNikeProduct({ ...fixture, structuredData: [{ '@graph': fixture.structuredData }] }, url)
      ?.variants,
  ).toHaveLength(13);
});

test('проверяет выбранную расцветку, регион, закрытый доступ и отключённые размеры', () => {
  expect(() => verifiedNikeProduct(fixture, url.replace('CW0907-002', 'CW0907-003'))).toThrow(
    'NIKE_SKU_MISMATCH',
  );
  const copy = structuredClone(fixture);
  copy.nextData.props.pageProps.marketPlace = 'GB';
  expect(() => verifiedNikeProduct(copy, url)).toThrow('NIKE_REGION_MISMATCH');
  const member = structuredClone(fixture);
  member.nextData.props.pageProps.selectedProduct.isMemberProduct = true;
  expect(verifiedNikeProduct(member, url)).toBeNull();
  const disabled = structuredClone(fixture);
  disabled.sizes[0].disabled = true;
  expect(verifiedNikeProduct(disabled, url)?.variants).toHaveLength(12);
});

test('сохраняет отдельные фиксированные цены разных размеров и исключает OutOfStock', () => {
  const copy = structuredClone(fixture);
  copy.structuredData[0].hasVariant[0].offers.price = 90;
  copy.structuredData[0].hasVariant[1].offers.availability = 'https://schema.org/OutOfStock';
  const p = verifiedNikeProduct(copy, url)!;
  expect(p.variants[0].salePrice).toBe('90.00');
  expect(p.variants).toHaveLength(12);
});

test('каталог Nike: дедупликация SKU, запрет обуви без скидок, бутс и посторонних URL', () => {
  const p = {
    productCode: 'CW0907-002',
    productType: 'FOOTWEAR',
    copy: { title: 'Test', subTitle: 'Running Shoes' },
    pdpUrl: { url },
    prices: { currentPrice: 80, initialPrice: 100, currency: 'USD' },
  };
  expect(
    nikeSaleCandidates([
      { products: [p, p, { ...p, productCode: 'bad', copy: { title: 'Football Cleats' } }] },
    ]),
  ).toHaveLength(1);
  expect(
    nikeSaleCandidates([{ products: [{ ...p, prices: { ...p.prices, currentPrice: 100 } }] }]),
  ).toEqual([]);
  expect(nikeProductUrl('https://www.nike.com.evil.test/t/test/AB1234-001')).toBeNull();
});

test('официальные размеры Nike переводятся в EU с учётом пола и детского суффикса', () => {
  expect(nikeEuSize('W 5 / M 3.5')).toBe(35.5);
  expect(nikeEuSize('M 8 / W 9.5')).toBe(41);
  expect(nikeEuSize('8', "Women's Shoes")).toBe(39);
  expect(nikeEuSize('8', "Men's Shoes")).toBe(41);
  expect(nikeEuSize('3Y')).toBe(35);
  expect(nikeEuSize('3C')).toBe(18.5);
  expect(nikeEuSize('3')).toBeUndefined();
  expect(nikeEuSize('7C/8C')).toBeUndefined();
});

test('сжатый большой отчёт передаётся без потери данных; повреждения и лишние кодировки отклоняются', () => {
  const raw = JSON.stringify({ products: ['x'.repeat(3_100_000)] });
  expect(decodeScrapeBody(gzipSync(raw), 'gzip')).toBe(raw);
  expect(() => decodeScrapeBody(Buffer.alloc(maxScrapeWireBytes + 1), null)).toThrow(
    'REPORT_TOO_LARGE',
  );
  expect(() => decodeScrapeBody(Buffer.from('bad'), 'gzip')).toThrow();
  expect(() => decodeScrapeBody(Buffer.from('{}'), 'br')).toThrow('REPORT_ENCODING');
});
