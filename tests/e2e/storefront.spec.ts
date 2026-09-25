import { test, expect } from '@playwright/test';

test('быстрый бюджет, мобильные фильтры, Escape и уменьшение движения', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?mode=demo');
  await expect(page.locator('.product-grid .product-card')).toHaveCount(8);
  await page.getByRole('button', { name: 'До 30 000 ₸' }).click();
  await expect(page.getByRole('button', { name: 'До 30 000 ₸' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.product-grid .product-card')).toHaveCount(2);
  const toggle = page.getByRole('button', { name: /^Фильтры/ });
  await toggle.click();
  const dialog = page.getByRole('dialog', { name: 'Твоя идеальная пара' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Сбросить все' }).click();
  await expect(page.locator('.product-grid .product-card')).toHaveCount(8);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  expect(
    await page
      .locator('.product-card')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
