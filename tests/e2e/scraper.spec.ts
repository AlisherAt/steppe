import { test, expect } from '@playwright/test';
import { collectPumaDetails } from '../../scripts/puma-details.mjs';
import { extract, price } from '../../scripts/scraper-extract.mjs';
test('Сборщик: точные цены, SKU, изображение, пропуск неполной карточки', async ({ page }) => {
  await page.setContent(
    `<article class="product-card" data-style-color="TEST-001"><h3>Test running shoes</h3><a href="https://shop.example/shoe">Открыть</a><img src="https://images.example/shoe.jpg"><del>$120.00</del><span class="price-sales">$80.00</span></article><article class="product-card"><h3>Другие shoes</h3><del>$100</del><span class="price-sales">from $50</span></article>`,
  );
  const result = await extract(page, {
    id: 'test',
    brand: 'Test',
    url: 'https://shop.example/sale',
  });
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    sku: 'TEST-001',
    old_price: 120,
    sale_price: 80,
    currency: 'USD',
    size_price_verified: false,
  });
  expect(price('$80–$100')).toBeNull();
  expect(price('from $80')).toBeNull();
  expect(price('$1,200.50')).toBe(1200.5);
});

test('Nike: Style ID из ссылки и reduced означает новую цену', async ({ page }) => {
  await page.setContent(
    `<div class="product-card"><a href="https://www.nike.com/t/test/AB1234-001">Test</a><img src="https://static.nike.com/test.jpg"><div class="product-card__title">Test running shoes</div><div class="product-price" data-testid="product-price-reduced">$87.97</div><div class="product-price is--striked-out" data-testid="product-price">$155</div></div>`,
  );
  const products = await extract(page, {
    id: 'nike',
    brand: 'Nike',
    url: 'https://www.nike.com/w/sale-shoes-3yaepzy7ok',
  });
  expect(products).toHaveLength(1);
  expect(products[0]).toMatchObject({ sku: 'AB1234-001', old_price: 155, sale_price: 87.97 });
});

test('Puma: артикул цвета и явная скидка без применения промокода', async ({ page }) => {
  await page.setContent(
    `<li data-test-id="product-list-item" data-product-id="402666_01"><a href="https://us.puma.com/us/en/pd/test/402666?swatch=01"></a><img src="https://images.puma.com/test.jpg"><h2>ST Miler Retro</h2><h3>Men's Sneakers</h3><span data-test-id="sale-price">$44.99</span><span data-test-id="price" class="line-through">$65.00</span><p>EXTRA 30% OFF WITH CODE</p></li>`,
  );
  const products = await extract(page, {
    id: 'puma',
    brand: 'Puma',
    url: 'https://us.puma.com/us/en/sale/all-sale',
  });
  expect(products).toHaveLength(1);
  expect(products[0]).toMatchObject({
    sku: '402666_01',
    name: 'ST Miler Retro',
    old_price: 65,
    sale_price: 44.99,
  });
});

test('Puma PDP: проверяет цену каждого выбранного размера и исключает отсутствующий', async ({
  page,
}) => {
  await page.setContent(
    `<main>Style: 402666_01 <span id="stock"></span><div id="size-picker"><label data-size="0200" data-disabled="false"><input type="radio" name="size" onchange="document.querySelector('#stock').textContent='IN STOCK'; document.querySelector('#sale').textContent='$44.99'"><span data-content="size-value">7</span></label><label data-size="0210" data-disabled="false"><input type="radio" name="size" onchange="document.querySelector('#stock').textContent='IN STOCK'; document.querySelector('#sale').textContent='$49.99'"><span data-content="size-value">7.5</span></label><label data-size="0220" data-disabled="true"><input type="radio" disabled><span data-content="size-value">8</span></label></div><span id="sale" data-test-id="item-sale-price-pdp">$44.99</span><span data-test-id="item-price-pdp">$65.00</span><button data-test-id="add-to-cart-button">Add to Cart</button><button data-test-id="size-guide-btn" onclick="document.querySelector('#guide').hidden=false">Size guide</button><div id="guide" hidden><table class="chart"><thead><tr><th>US</th><th>DE</th></tr></thead><tbody><tr><td>7</td><td>39</td></tr><tr><td>7.5</td><td>40</td></tr><tr><td>8</td><td>40.5</td></tr></tbody></table><button onclick="document.querySelector('#guide').hidden=true">Close</button></div></main><script type="application/ld+json">{"@type":"Product","name":"Test Men's Sneakers","model":"402666","offers":{"priceCurrency":"USD"},"image":["https://images.puma.com/test.jpg"]}</script>`,
  );
  const result = await collectPumaDetails(page, { sku: '402666_01' }, { delay: 0 });
  expect(
    result.variants.map((v: { sizeEU: string; salePrice: string }) => [v.sizeEU, v.salePrice]),
  ).toEqual([
    ['39', '44.99'],
    ['40', '49.99'],
  ]);
  expect(result.size_price_verified).toBe(true);
});
