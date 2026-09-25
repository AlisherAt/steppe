import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { demoProducts } from '../../src/lib/demo';
import { filterCatalog, filtersSchema } from '../../src/lib/catalog';

test('таблица: родной размер, цена, корзина, мобильная доступность', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Изолированная тестовая карточка; не записывается в live-каталог.
  const product = {
    ...demoProducts[0],
    brand: 'Reebok',
    name: 'Тестовая пара Reebok',
    gender: 'men',
    sizes: ['US M 9', 'US M 12'],
    saleKzt: 25000,
    sizePrices: [
      { size: 'US M 9', salePrice: '25000', saleKzt: 25000 },
      { size: 'US M 12', salePrice: '31000', saleKzt: 31000 },
    ],
  };
  await page.route('**/api/catalog?*', async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    await route.fulfill({ json: { ...result, products: [product], total: 1 } });
  });
  await page.goto('/?mode=demo');
  const card = page.locator('.product-card').filter({ hasText: product.name });
  const trigger = card.getByRole('button', { name: 'Таблица размеров' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Твой размер — без путаницы' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('tbody tr')).toHaveCount(2);
  await expect(dialog.locator('tbody tr').first()).toContainText('42');
  expect(
    (await new AxeBuilder({ page }).include('.size-guide-dialog[open]').analyze()).violations,
  ).toEqual([]);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/size-guide-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole('button', { name: 'Выбрать EU 45,5', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(card.getByRole('combobox')).toHaveValue('US M 12');
  await expect(card.locator('.product-info .product-prices strong')).toContainText(/31\s*000/);
  await card.getByRole('button', { name: /Добавить .* в корзину/ }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Открыть корзину, товаров: 1' }).click();
  await expect(page.getByRole('dialog', { name: 'Корзина 1' })).toContainText('EU 45,5');
});

test('детские US K автоматически видны и фильтруются как EU', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const product = {
    ...demoProducts[0],
    brand: 'Reebok',
    name: 'Club C Double Shoes - Big Kids',
    gender: 'kids' as const,
    sizes: ['US K 3.5', 'US K 5'],
  };
  await page.route('**/api/catalog?*', (route) =>
    route.fulfill({
      json: filterCatalog(
        [product],
        filtersSchema.parse(Object.fromEntries(new URL(route.request().url()).searchParams)),
        'demo',
      ),
    }),
  );
  await page.goto('/?mode=demo');
  const card = page.locator('.product-card').filter({ hasText: product.name });
  await expect(card.locator('option[value="US K 3.5"]')).toHaveText('EU 34,5');
  await expect(card.locator('option[value="US K 5"]')).toHaveText('EU 36,5');
  await page.getByRole('button', { name: /^Фильтры/ }).click();
  const filters = page.locator('#mobile-filters');
  await filters.getByRole('button', { name: 'EU 34,5', exact: true }).click();
  await filters.getByRole('button', { name: 'Показать результаты' }).click();
  await expect(page.locator('.product-card')).toHaveCount(1);
  await card.getByRole('button', { name: 'Таблица размеров' }).click();
  const guide = page.getByRole('dialog', { name: 'Твой размер — без путаницы' });
  await expect(guide.locator('tbody tr').first().locator('td').first()).toHaveText('34,5');
  await guide.getByRole('button', { name: 'Выбрать EU 36,5', exact: true }).click();
  await expect(card.locator('select')).toHaveValue('US K 5');
  await card.getByRole('button', { name: /Добавить .* в корзину/ }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Открыть корзину, товаров: 1' }).click();
  await expect(page.getByRole('dialog', { name: 'Корзина 1' })).toContainText('Размер EU 36,5');
});
