import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { demoProducts } from '../../src/lib/demo';
import type { Product } from '../../src/lib/types';
const shoe: Product = {
  ...demoProducts[0],
  id: 'a'.repeat(64),
  demo: false,
  name: 'Проверка выбора размеров',
  brand: 'Puma',
  sizes: ['EU 41', 'EU 42'],
  imageUrl:
    'https://images.puma.com/image/upload/f_auto,q_auto,b_rgb:fafafa,w_600,h_600/global/311098/01/sv01/fnd/PNA/fmt/png',
  saleKzt: 20000,
  department: 'sneakers',
  sizePrices: [
    { size: 'EU 41', salePrice: '30', saleKzt: 20000 },
    { size: 'EU 42', salePrice: '35', saleKzt: 25000 },
  ],
};
const top: Product = {
  ...shoe,
  id: 'b'.repeat(64),
  name: 'Тестовая футболка',
  category: 'Футболки и рубашки',
  department: 'casual',
  sizes: ['M'],
  sizePrices: undefined,
  saleKzt: 7000,
};
const bottom: Product = {
  ...top,
  id: 'c'.repeat(64),
  name: 'Тестовые брюки',
  category: 'Брюки и джинсы',
  saleKzt: 12000,
};

test.beforeEach(async ({ page }) => {
  // Проверяем интерфейс без зависимости от скорости внешних фотосерверов.
  await page.route('**/_next/image?**', (r) =>
    r.fulfill({ contentType: 'image/svg+xml', path: 'public/favicon.svg' }),
  );
  await page.route('**/api/catalog?**', (r) =>
    r.fulfill({
      json: {
        products: [shoe],
        total: 1,
        page: 1,
        pages: 1,
        mode: 'live',
        facets: { brands: ['Puma'], sizes: ['41', '42'], categories: ['Кроссовки'], sources: [] },
      },
    }),
  );
  await page.route('**/api/cart-check', (r) => r.fulfill({ json: { products: [shoe] } }));
  await page.route('**/api/outfits', (r) =>
    r.fulfill({
      json: {
        outfits: [
          {
            id: 'women-budget',
            title: 'Образ до 50 000 ₸',
            description: 'Три вещи',
            gender: 'women',
            products: [shoe, top, bottom],
            total: 39000,
            variablePrice: true,
          },
        ],
      },
    }),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('выбор размера, корзина и избранное переживают перезагрузку; WhatsApp получает новый размер', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/');
  const card = page.locator('.catalog-results .product-card').filter({ hasText: shoe.name });
  await card.getByRole('button', { name: /^В избранное:/ }).click();
  await expect(card.getByRole('button', { name: /^Убрать из избранного:/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await card.getByRole('button', { name: 'Выбрать размер', exact: true }).click();
  const detail = page.locator('.product-detail[open]');
  await detail.getByRole('button', { name: /Добавить .* в корзину/ }).click();
  await expect(detail.getByRole('alert')).toContainText('Выбери доступный размер');
  await detail.locator('.detail-sizes button').filter({ hasText: 'EU 41' }).click();
  await detail.getByRole('button', { name: /Добавить .* в корзину/ }).click();
  await detail.getByRole('button', { name: 'Перейти в корзину' }).click();
  await expect(page.locator('.cart-dialog[open]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Открыть корзину, товаров: 1', exact: true }).click();
  const cart = page.locator('.cart-dialog[open]');
  const select = cart.getByRole('combobox', { name: `Размер в корзине: ${shoe.name}` });
  await expect(select).toHaveValue('EU 41');
  await select.selectOption('EU 42');
  await expect(cart.locator('.cart-total')).toContainText(/25\s*000/);
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Открыть корзину, товаров: 1', exact: true }).click();
  await expect(select).toHaveValue('EU 42');
  await page.route('**/api/checkout/whatsapp', async (r) => {
    expect(r.request().postDataJSON()).toEqual({ items: [{ id: shoe.id, size: 'EU 42' }] });
    await r.fulfill({ json: { url: 'https://wa.me/77079223074?text=Test' } });
  });
  await page.route('https://wa.me/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<p>Тест перехода</p>' }),
  );
  await cart.getByRole('button', { name: 'Отправить заказ в WhatsApp' }).click();
  await expect(page).toHaveURL(/wa.me\/77079223074/);
  await page.goto('/favorites');
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByRole('button', { name: /^Убрать из избранного:/ }).click();
  await expect(page.getByRole('heading', { name: 'Собери свою подборку' })).toBeVisible();
});

test('мобильный каталог: чипы фильтров, нижнее меню, доступная карточка и полный образ', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page.locator('.catalog-results .product-card').filter({ hasText: shoe.name }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Быстрая навигация' })).toBeVisible();
  await page.getByRole('button', { name: 'До 30 000 ₸', exact: true }).click();
  const chips = page.getByLabel('Выбранные фильтры');
  await expect(chips).toContainText(/30\s*000/);
  await chips.getByRole('button', { name: /до 30/ }).click();
  await expect(chips).toHaveCount(0);
  const trigger = page.getByRole('button', { name: 'Фильтры', exact: true });
  await trigger.click();
  await expect(page.locator('#mobile-filters')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.locator('.catalog-results .choose-size-button').click();
  const detail = page.locator('.product-detail[open]');
  const violations = (
    await new AxeBuilder({ page })
      .include('.product-detail[open]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
  ).violations;
  expect(violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))).toEqual([]);
  await detail.getByRole('button', { name: 'Таблица размеров' }).click();
  await expect(page.locator('.size-guide-dialog[open]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('#outfits').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /Образ до 50 000/ }).click();
  await expect(page.locator('.outfit-expanded .product-card')).toHaveCount(3);
  await page.locator('.outfit-expanded .choose-size-button').nth(1).click();
  await expect(page.locator('.product-detail[open]')).toContainText('Тестовая футболка');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Свернуть образ' }).click();
  await expect(page.locator('.outfit-tile[aria-expanded="false"]')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('ошибка избранного не стирает сохранённое; недоступные товары можно убрать', async ({
  page,
}) => {
  await page.addInitScript(
    (id) => localStorage.setItem('steppe.favorites.v1', JSON.stringify([id])),
    shoe.id,
  );
  await page.route('**/api/cart-check', (r) => r.fulfill({ status: 503, json: { error: 'Test' } }));
  await page.goto('/favorites');
  await expect(page.locator('.saved-page [role=alert]')).toContainText('Твой список сохранён');
  await page.route('**/api/cart-check', (r) => r.fulfill({ json: { products: [] } }));
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByText(/Сейчас недоступно товаров: 1/)).toBeVisible();
  await page.getByRole('button', { name: 'Убрать недоступные' }).click();
  await expect(page.getByRole('heading', { name: 'Собери свою подборку' })).toBeVisible();
});
