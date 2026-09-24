import { test, expect } from '@playwright/test';
import { demoProducts } from '../../src/lib/demo';
test('Рынок США: текущая цена без фиктивной скидки и доставка не упоминается', async ({ page }) => {
  const product = {
    ...demoProducts[0],
    id: 'a'.repeat(64),
    demo: false,
    sourceId: 'kicks-stockx',
    sourceName: 'StockX · США',
    offerKind: 'retail',
    purchaseType: 'fixed',
    warehouseCountry: 'US',
    sizePrices: [{ size: '42', salePrice: '80', saleKzt: 40000 }],
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
  await expect(card).toContainText('Покупка без торгов');
  await expect(card).not.toContainText('Доставка');
  await card.locator('select').selectOption('42');
  await card.getByRole('button', { name: /Добавить/ }).click();
  await page.getByRole('button', { name: 'Открыть корзину, товаров: 1' }).click();
  await expect(
    page.getByRole('link', { name: /Перейти в магазин|В магазин|Перейти к предложению/ }),
  ).toHaveCount(0);
  const checkout = page.getByRole('button', { name: 'Оформить в WhatsApp' });
  await expect(checkout).toBeEnabled();
  await page.route('**/api/checkout/whatsapp', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'Не удалось проверить товары. Попробуйте ещё раз.' },
    }),
  );
  await checkout.click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Не удалось проверить товары',
  );
  await page.unroute('**/api/checkout/whatsapp');
  const target = 'https://wa.me/77001234567?text=' + encodeURIComponent('Тестовый список: EU 42');
  await page.route('**/api/checkout/whatsapp', (route) => {
    expect(route.request().postDataJSON()).toEqual({ items: [{ id: product.id, size: '42' }] });
    return route.fulfill({ json: { url: target } });
  });
  // Перехватываем переход: тест не обращается к WhatsApp и не отправляет сообщения.
  await page.route('https://wa.me/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>WhatsApp test</h1>' }),
  );
  await checkout.click();
  await expect(page).toHaveURL(target);
});
