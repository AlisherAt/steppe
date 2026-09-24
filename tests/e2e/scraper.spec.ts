import { test, expect } from '@playwright/test';
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
