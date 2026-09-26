import { describe, expect, test, vi } from 'vitest';
import {
  collectSource,
  extractObservation,
  productLinks,
  robotsPolicy,
  storeUrl,
  validateReaderPage,
} from '../scripts/agent-reach/catalog.mjs';
import { readerEnvironment } from '../scripts/agent-reach/runtime.mjs';

const nike = { id: 'nike', brand: 'Nike', url: 'https://www.nike.com/w/sale-shoes-3yaepzy7ok' };
const adidas = { id: 'adidas', brand: 'Adidas', url: 'https://www.adidas.com/us/shoes-sale' };
const product = 'https://www.nike.com/t/test-shoes/AB1234-001';
const at = '2026-09-26T09:00:00.000Z';
const page = (url: string, body: string) =>
  `Title: Test\nURL Source: ${url}\n\nMarkdown Content:\n${body}`;
const detail = page(
  product,
  '# Test Shoes\n![shoe](https://static.nike.com/test.jpg)\nOriginal Price: $120.00\nSale Price: $90.00\nSelect Size\n8\n9',
);

describe('Agent Reach: доверие к ответу', () => {
  test.each([403, 429, 503])(
    'отклоняет вложенную ошибку %s при успешном ответе reader',
    (status) => {
      expect(() =>
        validateReaderPage(
          page(nike.url, `Warning: Target URL returned error ${status}\n# Shoes $90`),
          nike.url,
        ),
      ).toThrow(`TARGET_HTTP_${status}`);
    },
  );
  test('не принимает CAPTCHA и другой регион', () => {
    expect(() => validateReaderPage(page(nike.url, 'Verify you are human'), nike.url)).toThrow(
      'ACCESS_CHALLENGE',
    );
    expect(() =>
      validateReaderPage(page('https://www.nike.com/gb/w/sale', '# Shoes'), nike.url),
    ).toThrow('READER_SOURCE_MISMATCH');
    expect(() => validateReaderPage('some text', nike.url)).toThrow('READER_SOURCE_MISMATCH');
  });
  test('не принимает предупреждение о незавершённой загрузке', () => {
    expect(() =>
      validateReaderPage(page(nike.url, 'Warning: This page may not be fully loaded'), nike.url),
    ).toThrow('READER_WARNING');
  });
  test('служебный рекламный ответ Adidas не считается каталогом', () => {
    expect(() =>
      validateReaderPage(
        `Title: https://match.adsrvr.org/track/cmf/google\nURL Source: ${adidas.url}\nMarkdown Content:\nA 1x1 image, likely be a tacker probe`,
        adidas.url,
      ),
    ).toThrow('READER_NOT_STORE_PAGE');
  });
});

test('дедупликация ссылок с проверкой магазина, пути и региона', () => {
  expect(
    productLinks(
      `[first](${product})\n[second](${product}#details)\n[x](https://attacker.test/t/shoes)`,
      nike,
    ),
  ).toEqual([product]);
  expect(storeUrl('https://www.adidas.com/us/test/AB1234.html', adidas)).toBeTruthy();
  for (const url of [
    'http://www.nike.com/t/test',
    'https://www.nike.com@127.0.0.1/t/test',
    'https://www.nike.com.evil.test/t/test',
    'https://www.nike.com/t/test?token=secret',
    'https://www.nike.com/t/%2e%2e/settings',
    'https://www.nike.com/gb/t/test',
  ])
    expect(storeUrl(url, nike)).toBeNull();
});

test('robots: ошибки не превращаются в разрешение', () => {
  expect(() => robotsPolicy('', 403, adidas)).toThrow('ROBOTS_HTTP_403');
  expect(() => robotsPolicy('<html>blocked</html>', 200, nike)).toThrow('INVALID_ROBOTS');
  expect(robotsPolicy('User-agent: *\nDisallow: /t/', 200, nike).allows(product)).toBe(false);
  expect(robotsPolicy('User-agent: JinaReader\nDisallow: /', 200, nike).allows(product)).toBe(
    false,
  );
  expect(robotsPolicy('', 404, nike).allows(product)).toBe(true);
  expect(() => robotsPolicy('User-agent: *\nCrawl-delay: 100', 200, nike)).toThrow(
    'CRAWL_DELAY_TOO_LONG',
  );
});

test('старую и новую цены читает только по явным подписям; размеры не подтверждены', () => {
  expect(extractObservation(detail, nike, product, at)).toMatchObject({
    sku: 'AB1234-001',
    name: 'Test Shoes',
    old_price: 120,
    sale_price: 90,
    currency: 'USD',
    complete_candidate: true,
    size_price_verified: false,
    freshness_verified: false,
  });
  const unlabeled = detail.replace('Original Price: ', '').replace('Sale Price: ', '');
  expect(extractObservation(unlabeled, nike, product, at).complete_candidate).toBe(false);
  expect(
    extractObservation(detail.replace('$90.00', '$130.00'), nike, product, at).complete_candidate,
  ).toBe(false);
  expect(
    extractObservation(detail.replace('$90.00', '$90.00 - $95.00'), nike, product, at)
      .complete_candidate,
  ).toBe(false);
});

test('формат Nike: цена пары подтверждается процентом, список размеров остаётся непроверенным', () => {
  const html = page(
    product,
    "## Error\n# Air Jordan OG\n## Women's Shoes\n$87.97$155 43% off\n![shoe](https://static.nike.com/test.png)\nSelect Size\nW 5 / M 3.5\nW 6 / M 4.5\nAdd to Bag",
  );
  const result = extractObservation(html, nike, product, at);
  expect(result).toMatchObject({
    name: 'Air Jordan OG',
    old_price: 155,
    sale_price: 87.97,
    size_candidates: ['US W 5 / M 3.5', 'US W 6 / M 4.5'],
    size_price_verified: false,
  });
  expect(
    extractObservation(html.replace('43% off', '80% off'), nike, product, at).complete_candidate,
  ).toBe(false);
  expect(
    extractObservation(html.replace('43% off', ''), nike, product, at).complete_candidate,
  ).toBe(false);
});

test('распроданный товар и ошибка загрузки не допускаются в кандидаты', () => {
  expect(
    extractObservation(
      detail.replace('Select Size', 'Sold Out: This product is currently unavailable'),
      nike,
      product,
      at,
    ),
  ).toMatchObject({ complete_candidate: false, reason: 'SOLD_OUT' });
  expect(
    extractObservation(
      detail.replace('Select Size', 'There was an error loading this page.'),
      nike,
      product,
      at,
    ),
  ).toMatchObject({ complete_candidate: false, reason: 'INCOMPLETE_PAGE' });
});

function options(read: ReturnType<typeof vi.fn>) {
  return {
    read,
    robots: vi.fn(async () => ({ status: 200, body: 'User-agent: *\nAllow: /' })),
    savePage: vi.fn(async () => {}),
    wait: vi.fn(async () => {}),
    now: () => at,
  };
}

test('403 robots останавливает работу до первого вызова Jina', async () => {
  const read = vi.fn();
  const deps = options(read);
  deps.robots.mockResolvedValue({ status: 403, body: '' });
  const result = await collectSource(adidas, deps);
  expect(read).not.toHaveBeenCalled();
  expect(result).toMatchObject({
    status: 'error',
    error: 'ROBOTS_HTTP_403',
    products: [],
    lastSuccessfulCheck: null,
  });
});

test('429 с карточками не запускает обход деталей и не помечает проход успешным', async () => {
  const read = vi.fn(async () => ({
    markdown: page(nike.url, `Warning: Target URL returned error 429\n[x](${product})`),
    version: '1.5.0',
  }));
  const result = await collectSource(nike, options(read));
  expect(read).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({
    status: 'error',
    error: 'TARGET_HTTP_429',
    products: [],
    lastSuccessfulCheck: null,
  });
});

test('успешное чтение сохраняет только частных кандидатов и ограничивает запросы', async () => {
  const read = vi.fn(async (url: string) => ({
    markdown:
      url === nike.url
        ? page(nike.url, `[x](${product})\n[y](https://www.nike.com/t/other-shoes/CD1234-001)`)
        : detail,
    version: '1.5.0',
  }));
  const result = await collectSource(nike, { ...options(read), limit: 1 });
  expect(read).toHaveBeenCalledTimes(2);
  expect(result).toMatchObject({
    status: 'partial',
    count: 1,
    lastSuccessfulCheck: at,
    discoveredLinks: 2,
  });
  expect(result.products[0].size_price_verified).toBe(false);
});

test('ошибка PDP не оставляет товары в результате', async () => {
  const read = vi.fn(async (url: string) => ({
    markdown: page(
      url,
      url === nike.url ? `[x](${product})` : 'Warning: Target URL returned error 403',
    ),
    version: '1.5.0',
  }));
  const result = await collectSource(nike, options(read));
  expect(result).toMatchObject({
    status: 'error',
    count: 0,
    products: [],
    error: 'TARGET_HTTP_403',
  });
});

test('Python не получает ключи проекта или прокси', () => {
  expect(
    readerEnvironment({
      PATH: 'tools',
      CRON_SECRET: 'secret',
      SEATABLE_API_TOKEN: 'secret',
      HTTP_PROXY: 'proxy',
      PYTHONPATH: 'injected',
      GITHUB_TOKEN: 'secret',
    }),
  ).toEqual({
    PATH: 'tools',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
  });
});
