import { test, expect } from '@playwright/test';
import { demoProducts } from '../../src/lib/demo';
import { filterCatalog, filtersSchema } from '../../src/lib/catalog';

test('Галерея: стрелки, клавиатура, детали и подборки', async ({ page }) => {
  const p = {
    ...demoProducts[0],
    name: 'Test Running Shoes',
    imageUrl: '/favicon.svg?view=1',
    imageUrls: ['/favicon.svg?view=2', '/favicon.svg?view=3'],
    color: 'Black/White',
    usage: 'Running',
  };
  await page.route('**/api/catalog?**', (route) =>
    route.fulfill({
      json: filterCatalog(
        [p],
        filtersSchema.parse(Object.fromEntries(new URL(route.request().url()).searchParams)),
      ),
    }),
  );
  await page.goto('/');
  const card = page.locator('.product-card').filter({ hasText: 'Test Running Shoes' });
  const gallery = card.locator('.product-gallery').first();
  await expect(gallery.locator('.gallery-count')).toHaveText('1 / 3');
  await gallery.getByRole('button', { name: 'Следующее фото' }).click();
  await expect(gallery.locator('.gallery-count')).toHaveText('2 / 3');
  await gallery.locator('.gallery-track').focus();
  await page.keyboard.press('ArrowRight');
  await expect(gallery.locator('.gallery-count')).toHaveText('3 / 3');
  await gallery.getByRole('button', { name: /^Подробнее:/ }).click();
  await expect(card.locator('.product-dialog')).toBeVisible();
  await expect(card.locator('.product-dialog .gallery-count')).toHaveText('1 / 3');
  await page.keyboard.press('Escape');
  await page
    .locator('.scenario-collections')
    .getByRole('button', { name: 'Для бега', exact: true })
    .click();
  await expect(page).toHaveURL(/collection=running/);
  await page.reload();
  await expect(
    page.locator('.scenario-collections').getByRole('button', { name: 'Для бега', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Для тренировок', exact: true }).click();
  await expect(page.getByText('Пока ничего не нашлось')).toBeVisible();
  await page.getByRole('button', { name: 'Чёрные и белые', exact: true }).click();
  await expect(card).toBeVisible();
});

test('Мобильная галерея: нативный свайп без открытия карточки', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const p = {
    ...demoProducts[0],
    name: 'Swipe Test',
    imageUrl: '/favicon.svg?a',
    imageUrls: ['/favicon.svg?b', '/favicon.svg?c'],
  };
  await page.route('**/api/catalog?**', (r) => r.fulfill({ json: filterCatalog([p]) }));
  await page.goto('/');
  const card = page.locator('.product-card').filter({ hasText: 'Swipe Test' });
  const track = card.locator('.gallery-track').first();
  await track.scrollIntoViewIfNeeded();
  const box = (await track.boundingBox())!;
  const client = await context.newCDPSession(page);
  const y = box.y + box.height / 2;
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + box.width * 0.8, y }],
  });
  for (let i = 1; i <= 8; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: box.x + box.width * (0.8 - i * 0.075), y }],
    });
    await page.waitForTimeout(30);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(card.locator('.gallery-count').first()).not.toHaveText('1 / 3');
  await expect(card.locator('.product-dialog')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
