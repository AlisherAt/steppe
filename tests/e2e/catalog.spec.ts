import { test, expect } from '@playwright/test';
test('Бренды ведут в реальный каталог, источники не притворяются подключёнными', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/brands');
  await expect(page.locator('.brand-tile')).toHaveCount(78);
  await page.getByRole('textbox', { name: 'Поиск бренда' }).fill('hoka');
  await expect(page.locator('.brand-tile')).toHaveCount(1);
  await expect(page.locator('.brand-tile')).toContainText('Пока нет предложений');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.locator('.brand-tile').click();
  await expect(page).toHaveURL(/mode=live.*brands=HOKA/);
  await expect(page.locator('.product-card')).toHaveCount(0);
  await page.goto('/sources');
  await expect(page.getByRole('heading', { name: 'Из-за рубежа — в Казахстан' })).toBeVisible();
  await expect(page.locator('.status-badge')).toHaveCount(11);
  await expect(page.locator('.status-badge.ready')).toHaveCount(0);
});
test('Русский каталог: фильтры, размер, корзина после перезагрузки', async ({ page }) => {
  await page.goto('/?mode=demo');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByRole('heading', { name: 'Лови свою пару.' })).toBeVisible();
  await expect(page.getByText('8 демопримеров', { exact: true })).toBeVisible();
  const sidebar = await page.locator('.filters').boundingBox();
  const brandInput = await page
    .getByRole('checkbox', { name: 'Nike', exact: true })
    .first()
    .boundingBox();
  expect(brandInput!.x + brandInput!.width).toBeLessThanOrEqual(sidebar!.x + sidebar!.width);
  await page.getByRole('textbox', { name: 'Поиск кроссовок' }).fill('городской');
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Добавить Air Max — городской ритм в корзину' }).click();
  await expect(page.locator('#error-demo-1')).toHaveText('Сначала выбери размер');
  await page.locator('#size-demo-1').selectOption('42');
  await page.getByRole('button', { name: 'Добавить Air Max — городской ритм в корзину' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Открыть корзину, товаров: 1' }).click();
  const cart = page.getByRole('dialog', { name: 'Корзина 1' });
  await expect(cart).toBeVisible();
  await expect(cart.getByText('Размер EU 42', { exact: false })).toBeVisible();
  await expect(cart.getByText('Демонстрация, покупка недоступна')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(cart).not.toBeVisible();
  await page.getByRole('button', { name: 'Открыть корзину, товаров: 1' }).click();
  await page.getByRole('button', { name: 'Удалить Air Max — городской ритм' }).click();
  await expect(page.getByText('Хорошая пара ещё найдётся')).toBeVisible();
});
test('Реальный каталог отделён от демо, неверные параметры отклоняются', async ({
  page,
  request,
}) => {
  await page.goto('/?mode=live');
  await expect(page.getByRole('heading', { name: 'Скоро здесь будут находки' })).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(0);
  expect((await request.get('/api/catalog?minPrice=100&maxPrice=1')).status()).toBe(400);
  expect((await request.get('/api/catalog?mode=bogus')).status()).toBe(400);
  expect((await request.post('/api/cron/refresh')).status()).toBe(503);
});
test('Мобильный интерфейс без горизонтального скролла, фильтры работают', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mode=demo');
  await expect(page.getByText('8 демопримеров', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Adidas', exact: true }).first().check();
  await page.getByRole('button', { name: 'Показать результаты' }).click();
  await expect(page.locator('.product-card')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('Пустое состояние, сортировка, ошибка API и карточка с пояснением', async ({ page }) => {
  await page.goto('/?mode=demo');
  await expect(page.locator('.product-card')).toHaveCount(8);
  await page.getByRole('combobox', { name: 'Сортировка' }).selectOption('price_asc');
  await expect(page.locator('.product-card').first()).toContainText('Junior');
  await page
    .locator('.product-card')
    .first()
    .getByRole('button', { name: 'Подробнее: Junior — больше движения' })
    .click();
  await expect(
    page.getByRole('dialog').getByText('Это пример интерфейса.', { exact: false }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('textbox', { name: 'Поиск кроссовок' }).fill('отсутствующий');
  await expect(page.getByRole('heading', { name: 'Эта пара пока не нашлась' })).toBeVisible();
  await page.route('**/api/catalog?**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Проверка ошибки' }),
    }),
  );
  await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).last().click();
  await expect(
    page.getByRole('heading', { name: 'Не получилось загрузить каталог' }),
  ).toBeVisible();
});
