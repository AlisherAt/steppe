import { test, expect } from '@playwright/test';
import { collectPumaDetails } from '../../scripts/puma-details.mjs';
import { extract, price } from '../../scripts/scraper-extract.mjs';
import {
  collectFila,
  collectBrooks,
  collectOn,
  discoverRetail,
} from '../../scripts/retail-details.mjs';
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

test('FILA: скрытый список размеров исключает soldout и сохраняет EUR', async ({ page }) => {
  await page.setContent(
    `<meta itemprop="sku" content="1716266-V2"><meta itemprop="name" content="Test"><meta itemprop="priceCurrency" content="EUR"><img src="https://www.fila.de/1716266.jpg"><div hidden><div class="size"><a class="selectSize" data-sku="1716266-V2-43" data-size-original="43" data-price="70.95 €" data-tprice="€ 109.95">43</a></div><div class="size inactive"><a class="selectSize" data-sku="1716266-V2-42" data-size-original="42" data-price="70.95 €" data-tprice="€ 109.95">42<span class="soldout">Ausverkauft</span></a></div></div>`,
  );
  const p = await collectFila(page, { id: 'fila', brand: 'Fila' });
  expect(p.currency).toBe('EUR');
  expect(p.variants).toHaveLength(1);
  expect(p.variants[0]).toMatchObject({
    size: 'EU 43',
    salePrice: '70.95',
    originalPrice: '109.95',
  });
});
test('Brooks: выбранный размер подтверждается aria-current, ширина остаётся в варианте', async ({
  page,
}) => {
  await page.route('**/shoes/test', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: `<main><i data-attr="width" data-attr-selected="true" data-attr-value="1B"></i><i data-attr="color" data-attr-selected="true" data-attr-value="043"></i><button data-attr="size_Shoe" data-attr-value="7.0" data-url="https://www.brooksrunning.com/variation" data-attr-selected="false" aria-current="false" onclick="this.setAttribute('aria-current','true');document.querySelector('#add').disabled=false">7.0</button><button class="m-buy-box-grid__btn--sold-out" data-attr="size_Shoe" data-attr-value="8.0">8.0</button><p>Original price $160.00 Current price $109.95</p><button id="add" data-add-to-cart disabled>Add to cart</button></main><script type="application/ld+json">{"@type":"Product","sku":"120457","name":"Test","category":"women","image":["https://www.brooksrunning.com/test.jpg"],"offers":{"priceCurrency":"USD"}}</script>`,
    }),
  );
  await page.goto('/shoes/test');
  const p = await collectBrooks(
    page,
    { id: 'brooks', brand: 'Brooks' },
    { delay: 0, allowed: () => true },
  );
  expect(p.variants).toHaveLength(1);
  expect(p.variants[0]).toMatchObject({ size: 'US W 7 1B', salePrice: '109.95' });
});
test('On: проверяет выбранный размер и цену, пропускает disabled', async ({ page }) => {
  const url = 'http://localhost:3100/en-us/products/test/mens/test-shoes-TEST';
  await page.route(url, (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: `<main><button data-test-id="purchasePodSelectSizeButton" aria-expanded="false" onclick="this.setAttribute('aria-expanded','true');document.querySelector('#options').hidden=false">Size</button><div id="options" hidden><button data-test-id="purchasePodSizeButton" onclick="const p=document.querySelector('[data-test-id=purchasePodSelectSizeButton]');p.textContent='US 7';p.setAttribute('aria-expanded','false');document.querySelector('#options').hidden=true;document.querySelector('#add').disabled=false"><span data-wk-name="purchasePodSizeOption">7</span></button><button data-test-id="purchasePodSizeButton" disabled><span data-wk-name="purchasePodSizeOption">8</span></button></div><p>Current price $125.00 original price $180.00</p><button id="add" disabled>Add to bag</button></main><script type="application/ld+json">{"@type":"Product","sku":"TEST","name":"Men's shoes","image":"https://images.ctfassets.net/test.jpg","offers":{"url":"${url}","priceCurrency":"USD","price":125,"priceSpecification":{"price":180}}}</script>`,
    }),
  );
  await page.goto(url);
  const p = await collectOn(page, { id: 'on', brand: 'On' }, { delay: 0 });
  expect(p.variants).toHaveLength(1);
  expect(p.variants[0]).toMatchObject({ size: 'US M 7', salePrice: '125.00' });
});
test('Reebok: дубли ссылок коллекции не расходуют лимит проверки моделей', async ({ page }) => {
  await page.setContent(
    '<div class="product-grid-item"><a href="https://www.reebok.com/collections/sale/products/test">A</a><a href="https://www.reebok.com/products/test">A</a></div>',
  );
  expect(
    await discoverRetail(page, { id: 'reebok', url: 'https://www.reebok.com/collections/sale' }),
  ).toEqual(['https://www.reebok.com/products/test']);
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
