import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('Доступность новых страниц брендов и магазинов', async ({ page }) => {
  for (const route of ['/brands', '/sources']) {
    await page.goto(route);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
  }
});
test('Контраст, подписи, семантика каталога и фокус корзины', async ({ page }) => {
  await page.goto('/?mode=demo');
  await expect(page.locator('.product-card')).toHaveCount(8);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  const trigger = page.getByRole('button', { name: 'Открыть корзину, товаров: 0' });
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Корзина 0' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
