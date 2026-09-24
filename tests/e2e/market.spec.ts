import { test, expect } from '@playwright/test';
import { demoProducts } from '../../src/lib/demo';
test('Рынок США: текущая цена без фиктивной скидки и доставка не упоминается', async ({ page }) => {
  const product = {
    ...demoProducts[0],
    id: 'a'.repeat(64),
    demo: false,
    sourceId: 'kicks-stockx',
    sourceName: 'StockX · США',
    offerKind: 'market',
    market: 'US',
    sku: 'TEST-US-42',
    originalPrice: null,
    originalKzt: null,
    discount: 0,
    currency: 'USD',
    salePrice: '80',
    saleKzt: 40000,
    sizes: ['42'],
    sourceUpdatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    delivery: undefined,
  };
  await page.route('**/api/catalog?**', (route) =>
    route.fulfill({
      json: {
        products: [product],
        total: 1,
        page: 1,
        pages: 1,
        mode: 'live',
        facets: {
          brands: ['Nike'],
          sizes: ['42'],
          sources: [{ id: 'kicks-stockx', name: 'StockX · США' }],
          categories: ['Кроссовки'],
        },
      },
    }),
  );
  await page.route('**/api/cart-check', (route) =>
    route.fulfill({ json: { products: [product] } }),
  );
  await page.goto('/?mode=live');
  const card = page.locator('.product-card');
  await expect(card).toHaveCount(1);
  await expect(card.locator('del')).toHaveCount(0);
  await expect(card.locator('.discount-badge')).toHaveCount(0);
  await expect(card).toContainText('Рынок США');
  await expect(card).not.toContainText('Доставка');
  await card.locator('select').selectOption('42');
  await card.getByRole('button', { name: /Добавить/ }).click();
  await page.getByRole('button', { name: 'Открыть корзину, товаров: 1' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Корзина 1' })
      .getByRole('link', { name: /Перейти в магазин/ }),
  ).toBeVisible();
});
