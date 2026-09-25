import { test, expect } from '@playwright/test';
import { demoProducts } from '../../src/lib/demo';

test('Админ: импорт → проверка → публикация → удаление → восстановление', async ({ page }) => {
  const product = {
    ...demoProducts[0],
    id: 'a'.repeat(64),
    imageUrl: null,
    name: 'FILA проверка',
    brand: 'FILA',
    demo: false,
    saleKzt: 15000,
    productUrl: 'https://www.fila.de/test',
    sizes: ['EU 41', 'EU 42'],
    sizePrices: [
      { size: 'EU 41', salePrice: '30', saleKzt: 15000 },
      { size: 'EU 42', salePrice: '50', saleKzt: 25000 },
    ],
  };
  const selling = {
    ...product,
    saleKzt: 18000,
    sizePrices: product.sizePrices.map((p, i) => ({ ...p, saleKzt: i ? 28000 : 18000 })),
  };
  const draft = { draftId: '00000000-0000-4000-8000-000000000000', product, selling };
  let imported = false,
    published = false,
    hidden = false;
  await page.route('**/api/admin/import', (route) => {
    expect(route.request().postDataJSON()).toEqual({ url: product.productUrl });
    imported = true;
    return route.fulfill({ json: draft });
  });
  await page.route('**/api/admin/products', (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      expect(req.postDataJSON()).toMatchObject({
        confirmed: true,
        selections: [
          { index: 0, size: 'EU 41' },
          { index: 1, size: 'EU 42' },
        ],
      });
      expect(req.postDataJSON()).not.toHaveProperty('saleKzt');
      published = true;
      return route.fulfill({ json: { published: true } });
    }
    if (req.method() === 'DELETE') {
      hidden = !req.postDataJSON().restore;
      return route.fulfill({ json: { hidden } });
    }
    return route.fulfill({
      json: {
        user: 'owner',
        products: published ? [{ product, selling, hidden, stale: false, manual: true }] : [],
        drafts: imported && !published ? [draft] : [],
      },
    });
  });
  await page.goto('/admin');
  await page.getByLabel('Ссылка на товар магазина').fill(product.productUrl);
  await page.getByRole('button', { name: 'Получить данные' }).click();
  await expect(page.getByRole('heading', { name: 'Проверь и опубликуй' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Опубликовать', exact: true })).toBeDisabled();
  await expect(page.locator('.admin-variant').last()).toContainText(/28\s?000/);
  await page.getByLabel('Я проверил фото', { exact: false }).check();
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.locator('.admin-product')).toHaveCount(1);
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Удалить FILA проверка', exact: true }).click();
  await expect(page.locator('.admin-product')).toHaveCount(0);
  await page.getByRole('button', { name: 'Удалённые', exact: true }).click();
  await page.getByRole('button', { name: 'Восстановить FILA проверка', exact: true }).click();
  await page.getByRole('button', { name: 'В каталоге', exact: true }).click();
  await expect(page.locator('.admin-product')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'artifacts/admin-mobile.png', fullPage: true });
});
test('Обычный пользователь не видит форму управления', async ({ page }) => {
  await page.route('**/api/admin/products', (route) =>
    route.fulfill({ status: 403, json: { error: 'Этот аккаунт не имеет прав администратора.' } }),
  );
  await page.goto('/admin');
  await expect(page.getByText('Этот аккаунт не имеет прав администратора.')).toBeVisible();
  await expect(page.getByLabel('Ссылка на товар магазина')).toHaveCount(0);
});
