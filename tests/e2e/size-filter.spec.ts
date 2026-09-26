import { test, expect } from '@playwright/test';

for (const mobile of [false, true]) {
  test(`Компактные размеры: поиск, выбор и сохранение — ${mobile ? 'телефон' : 'компьютер'}`, async ({
    page,
  }) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.route('**/api/catalog?**', (route) =>
      route.fulfill({
        json: {
          products: [],
          total: 0,
          page: 1,
          pages: 0,
          mode: 'live',
          facets: {
            brands: ['Nike'],
            sources: [],
            categories: [],
            sizes: ['16', '20', '35', '36', '38', '38.5', '39', '42', '42.5'],
            sizeGroups: {
              adults: ['35', '36', '38', '38.5', '39', '42', '42.5'],
              kids: ['16', '20', '35', '39'],
            },
          },
        },
      }),
    );
    await page.goto('/?mode=live');
    const openMobile = async () => {
      if (mobile)
        await page
          .getByRole('button', { name: /^Фильтры/ })
          .first()
          .click();
    };
    await openMobile();
    const root = page.locator(mobile ? '.mobile-filter-content' : '.filters');
    const filter = root.locator('.compact-size-filter');
    const trigger = filter.getByRole('button', { name: 'Выбрать размер' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(filter.getByRole('searchbox')).not.toBeVisible();
    await trigger.click();
    const search = filter.getByRole('searchbox', { name: 'Найти размер EU' });
    await expect(search).toBeFocused();
    await filter.getByRole('button', { name: 'Детские', exact: true }).click();
    await expect(filter.getByRole('button', { name: 'EU 16', exact: true })).toBeVisible();
    await expect(filter.getByRole('button', { name: 'EU 42', exact: true })).toHaveCount(0);
    await search.fill('38,5'); // Поиск ищет во всех группах, даже если открыта детская.
    await filter.getByRole('button', { name: 'EU 38,5', exact: true }).click();
    await expect(page).toHaveURL(/sizes=38\.5/);
    await search.fill('42');
    await filter.getByRole('button', { name: 'EU 42', exact: true }).click();
    await expect(page).toHaveURL(/sizes=38\.5%2C42/);
    await search.focus();
    await page.keyboard.press('Escape');
    await expect(filter.getByRole('button', { name: 'Выбрано: 2' })).toBeFocused();
    await expect(filter.getByRole('searchbox')).not.toBeVisible();
    if (mobile) await expect(page.locator('.filter-dialog')).toBeVisible();
    await page.reload();
    await openMobile();
    await expect(filter.getByRole('button', { name: 'Убрать размер EU 38,5' })).toBeVisible();
    await filter.getByRole('button', { name: 'Убрать размер EU 38,5' }).click();
    await expect(page).toHaveURL(/sizes=42(?:&|$)/);
    await filter.getByRole('button', { name: 'Сбросить размеры' }).click();
    await expect(filter.getByRole('button', { name: 'Выбрать размер' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
