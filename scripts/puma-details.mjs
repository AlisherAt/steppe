import { price } from './scraper-extract.mjs';

// Читаем таблицу именно открытого товара; US и EU не пересчитываются формулой.
export async function sizeMap(page) {
  return page.evaluate(() => {
    const tables = [...document.querySelectorAll('table')].filter((t) => {
      const headers = [...t.querySelectorAll('thead th')].map((e) => e.textContent.trim());
      return headers.includes('US') && (headers.includes('DE') || headers.includes('EU'));
    });
    if (tables.length !== 1) throw Error('PUMA_AMBIGUOUS_SIZE_GUIDE');
    const headers = [...tables[0].querySelectorAll('thead th')].map((e) => e.textContent.trim());
    const us = headers.indexOf('US'),
      eu = headers.includes('EU') ? headers.indexOf('EU') : headers.indexOf('DE');
    const result = {};
    for (const row of tables[0].querySelectorAll('tbody tr')) {
      const cells = [...row.querySelectorAll('td')].map((e) => e.textContent.trim());
      if (!/^\d+(\.\d+)?$/.test(cells[us] || '') || !/^\d+(\.\d+)?$/.test(cells[eu] || ''))
        continue;
      if (result[cells[us]] && result[cells[us]] !== cells[eu])
        throw Error('PUMA_AMBIGUOUS_SIZE_GUIDE');
      result[cells[us]] = cells[eu];
    }
    return result;
  });
}

export async function collectPumaDetails(
  page,
  candidate,
  { checkAccess = async () => {}, delay = 2500, deadline = Date.now() + 120000 } = {},
) {
  await page.addLocatorHandler(page.locator('#onetrust-accept-btn-handler'), async (button) => {
    await button.click();
  });
  await page.locator('#size-picker').waitFor({ timeout: 15000 });
  await checkAccess();
  const text = await page.locator('main').innerText();
  if (!text.includes(`Style: ${candidate.sku}`)) throw Error('PUMA_STYLE_MISMATCH');
  const structured = await page.locator('script[type="application/ld+json"]').evaluateAll((nodes) =>
    nodes.flatMap((n) => {
      try {
        const p = JSON.parse(n.textContent);
        return p['@type'] === 'Product' ? [p] : [];
      } catch {
        return [];
      }
    }),
  );
  const product = structured.find(
    (p) => p.model === candidate.sku.split('_')[0] && p.offers?.priceCurrency === 'USD',
  );
  if (!product) throw Error('PUMA_PRODUCT_DATA_MISSING');
  const gender = /women/i.test(product.name)
    ? 'women'
    : /men/i.test(product.name)
      ? 'men'
      : /kids|youth|junior|baby|toddler/i.test(product.name)
        ? 'kids'
        : 'unisex';
  // В собственной одноразовой сессии закрываем обычное окно cookies штатной кнопкой.
  const cookies = page.locator('#onetrust-accept-btn-handler');
  if (await cookies.isVisible()) await cookies.click();
  await page.locator('[data-test-id="size-guide-btn"]').click();
  await page.locator('table.chart').first().waitFor({ timeout: 10000 });
  const conversion = await sizeMap(page);
  await page
    .getByRole('button', { name: 'Close', exact: true })
    .filter({ visible: true })
    .last()
    .click();
  const sizes = await page
    .locator('#size-picker label[data-disabled="false"]')
    .evaluateAll((nodes) =>
      nodes.map((e) => ({
        id: e.getAttribute('data-size'),
        us: e.querySelector('[data-content="size-value"]')?.textContent.trim(),
      })),
    );
  const variants = [];
  for (const size of sizes) {
    if (Date.now() > deadline) throw Error('PUMA_DETAIL_TIME_LIMIT');
    if (!/^\d+$/.test(size.id || '') || !conversion[size.us]) continue;
    await checkAccess();
    const input = page.locator(`#size-picker label[data-size="${size.id}"] input`);
    if (!(await input.isEnabled())) continue;
    await page.locator(`#size-picker label[data-size="${size.id}"]`).click();
    await page.waitForTimeout(delay);
    await checkAccess();
    await page.locator('[data-test-id="item-sale-price-pdp"]').waitFor({ timeout: 10000 });
    if (!(await input.isChecked()) || !(await input.isEnabled()))
      throw Error('PUMA_SIZE_NOT_SELECTED');
    if (!(await page.locator('[data-test-id="add-to-cart-button"]').isEnabled())) continue;
    if (!/\bIN STOCK\b/i.test(await page.locator('main').innerText())) continue;
    const sale = price(await page.locator('[data-test-id="item-sale-price-pdp"]').innerText());
    const old = price(await page.locator('[data-test-id="item-price-pdp"]').innerText());
    if (sale === null || old === null || sale >= old) continue;
    variants.push({
      id: size.id,
      sizeUS: size.us,
      sizeEU: conversion[size.us],
      salePrice: sale.toFixed(2),
      originalPrice: old.toFixed(2),
      available: true,
      checkedAt: new Date().toISOString(),
    });
  }
  if (!variants.length) throw Error('PUMA_NO_VERIFIED_SIZES');
  return {
    ...candidate,
    name: product.name,
    image_url: product.image?.[0] || candidate.image_url,
    gender,
    size_price_verified: true,
    variants,
    checked_at: new Date().toISOString(),
  };
}
