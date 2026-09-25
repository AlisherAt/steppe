import { test, expect, type Page } from '@playwright/test';
import { collectAdidasDetails } from '../../scripts/adidas-details.mjs';
import { extract } from '../../scripts/scraper-extract.mjs';
import { extractPython } from '../../scripts/python-parsers.mjs';
// Искусственные данные только для тестов; никогда не загружаются в SeaTable.
const candidate = {
  source: 'adidas',
  brand: 'Adidas',
  sku: 'AB1234',
  name: 'Test Shoes',
  product_url: 'https://www.adidas.com/us/test-shoes/AB1234.html',
  image_url: 'https://assets.adidas.com/test.jpg',
  old_price: 100,
  sale_price: 60,
};
test('Присланный Python-парсер получает DOM Playwright и сохраняет неподтверждённый статус', async ({
  page,
}) => {
  const old = process.env.PYTHON_SALE_PARSERS;
  process.env.PYTHON_SALE_PARSERS = '1';
  try {
    await page.route(candidate.product_url, (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: `
      <div data-testid="plp-product-card"><a href="${candidate.product_url}">Open</a>
      <h3 data-testid="product-card-description-link">Test Shoes</h3><img src="${candidate.image_url}">
      <span data-testid="sale-price">$60</span><s data-testid="original-price">$100</s></div>
      <script type="application/ld+json">{"@type":"Product","name":"Test Shoes","sku":"AB1234"}</script>
      <div class="size-selector"><button>7</button><button disabled>8</button></div>`,
      }),
    );
    await page.goto(candidate.product_url);
    const source = { id: 'adidas', brand: 'Adidas', url: 'https://www.adidas.com/us/shoes-sale' };
    const products = await extractPython(page, source);
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      sku: 'AB1234',
      sale_price: 60,
      size_price_verified: false,
    });
    expect(await extractPython(page, source, candidate)).toEqual({
      sku: 'AB1234',
      size_candidates: ['7'],
    });
  } finally {
    if (old === undefined) delete process.env.PYTHON_SALE_PARSERS;
    else process.env.PYTHON_SALE_PARSERS = old;
  }
});
async function fixture(page: Page, select = true) {
  await page.route('https://www.adidas.com/**', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: `
    <main><h1>Test Shoes</h1><p>Men's • Running</p><div data-auto-id="size-selector">
    ${[7, 8, 9]
      .map(
        (n) => `<button ${n === 9 ? 'disabled' : ''} aria-pressed="false" onclick="
      ${select ? "document.querySelectorAll('[aria-pressed]').forEach(e=>e.setAttribute('aria-pressed','false'));this.setAttribute('aria-pressed','true');" : ''}
      document.querySelector('.gl-price-item--sale').textContent='$${n === 8 ? 70 : 60}';">${n}</button>`,
      )
      .join('')}
    </div><span class="gl-price-item--sale">$60</span><s class="gl-price-item--crossed">$100</s>
    <button data-auto-id="add-to-bag" onclick="throw Error('Покупка в тесте запрещена')">Add to bag</button></main>`,
    }),
  );
  await page.goto(candidate.product_url);
}
test('adidas: цена каждого размера, отсутствующий размер исключён', async ({ page }) => {
  await fixture(page);
  const p = await collectAdidasDetails(page, candidate, { delay: 0 });
  expect(p.variants.map((v: { size: string; salePrice: string }) => [v.size, v.salePrice])).toEqual(
    [
      ['US M 7', '60.00'],
      ['US M 8', '70.00'],
    ],
  );
  expect(p.size_price_verified).toBe(true);
});
test('adidas: доступная кнопка покупки без подтверждения выбора недостаточна', async ({ page }) => {
  await fixture(page, false);
  await expect(collectAdidasDetails(page, candidate, { delay: 0 })).rejects.toThrow(
    'ADIDAS_NO_VERIFIED_VARIANTS',
  );
});
test('adidas: остановка при блокировке после выбора', async ({ page }) => {
  await fixture(page);
  let checks = 0;
  await expect(
    collectAdidasDetails(page, candidate, {
      delay: 0,
      checkAccess: async () => {
        if (++checks === 3) throw Error('ACCESS_HTTP_403');
      },
    }),
  ).rejects.toThrow('ACCESS_HTTP_403');
});
test('adidas: SKU из ссылки, карточка пока не подтверждает размеры', async ({ page }) => {
  await page.setContent(`<article data-auto-id="product-container"><a href="${candidate.product_url}">Open</a>
    <h3 data-auto-id="product-card-title">Test Shoes</h3><img src="${candidate.image_url}">
    <s class="gl-price-item--crossed">$100</s><span class="gl-price-item--sale">$60</span></article>`);
  const p = await extract(page, {
    id: 'adidas',
    brand: 'Adidas',
    url: 'https://www.adidas.com/us/shoes-sale',
  });
  expect(p).toHaveLength(1);
  expect(p[0]).toMatchObject({ sku: 'AB1234', sale_price: 60, size_price_verified: false });
});
