import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { demoProducts } from '../../src/lib/demo';

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
  await dialog.getByRole('button', { name: 'Выбрать US M 12', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(card.getByRole('combobox')).toHaveValue('US M 12');
  await expect(card.locator('.product-info .product-prices strong')).toContainText(/31\s*000/);
  await card.getByRole('button', { name: /Добавить .* в корзину/ }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Открыть корзину, товаров: 1' }).click();
  await expect(page.getByRole('dialog', { name: 'Корзина 1' })).toContainText('US M 12');
});
