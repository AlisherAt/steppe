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
