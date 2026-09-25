import { price } from './scraper-extract.mjs';
const cookieHandlers = new WeakSet();

// Данные, уже встроенные магазином в публичную страницу: цена цвета и его размеры.
// Не запрашиваем внутренние API; сверяем цену с видимой карточкой и доступные размеры с UI.
export function pumaEmbeddedVariants(
  state,
  sku,
  conversion,
  enabled,
  displayed,
  now = new Date().toISOString(),
) {
  const parts = Object.values(state?.props?.urqlState || {})
    .flatMap((entry) => {
      try {
        const data = typeof entry.data === 'string' ? JSON.parse(entry.data) : entry.data;
        return data?.product?.id === sku.split('_')[0] ? data.product.variations || [] : [];
      } catch {
        return [];
      }
    })
    .filter((v) => v.id === sku);
  const priced = parts.find((v) => v.productPrice),
    stocked = parts.find((v) => Array.isArray(v.sizeGroups));
  if (!priced || !stocked) return null;
  const sale = price(priced.productPrice.salePrice),
    old = price(priced.productPrice.price);
  if (
    !priced.orderable ||
    priced.isAppExclusive ||
    priced.productPrice.isSalePriceElapsed ||
    sale === null ||
    old === null ||
    sale >= old ||
    sale !== displayed.sale ||
    old !== displayed.old
  )
    return null;
  const sizes = stocked.sizeGroups.flatMap((g) => g.sizes || []);
  if (new Set(sizes.map((s) => s.id)).size !== sizes.length) return null;
  const result = [];
  for (const size of sizes) {
    if (!size.orderable || !conversion[size.label]) continue;
    if (!enabled.some((e) => e.id === size.id && e.us === size.label)) return null;
    result.push({
      id: size.id,
      sizeUS: size.label,
      sizeEU: conversion[size.label],
      salePrice: sale.toFixed(2),
      originalPrice: old.toFixed(2),
      available: true,
      checkedAt: now,
    });
  }
  if (enabled.some((e) => conversion[e.us] && !result.some((v) => v.id === e.id))) return null;
  return result.length ? result : null;
}

// Читаем таблицу именно открытого товара; US и EU не пересчитываются формулой.
export async function sizeMap(page, gender = 'unisex') {
  return page.evaluate((gender) => {
    let tables = [...document.querySelectorAll('table')].filter((t) => {
      const headers = [...(t.rows[0]?.cells || [])].map((e) => e.textContent.trim());
      return (
        t.getClientRects().length &&
        headers.includes('US') &&
        (headers.includes('DE') || headers.includes('EU'))
      );
    });
    if (tables.length > 1 && ['men', 'women'].includes(gender)) {
      const pattern = gender === 'women' ? /^women['’]s shoes$/i : /^men['’]s shoes$/i;
      tables = tables.filter((t) =>
        pattern.test(
          t.closest('.size-chart-section')?.querySelector('.sizeheading')?.textContent.trim() || '',
        ),
      );
    }
    if (!tables.length) throw Error('PUMA_AMBIGUOUS_SIZE_GUIDE');
    const maps = tables
      .map((table) => {
        const headers = [...table.rows[0].cells].map((e) => e.textContent.trim());
        const us = headers.indexOf('US'),
          eu = headers.includes('EU') ? headers.indexOf('EU') : headers.indexOf('DE');
        const result = {};
        for (const row of [...table.rows].slice(1)) {
          const cells = [...row.cells].map((e) => e.textContent.trim());
          if (!/^\d+(\.\d+)?$/.test(cells[us] || '') || !/^\d+(\.\d+)?$/.test(cells[eu] || ''))
            continue;
          if (result[cells[us]] && result[cells[us]] !== cells[eu])
            throw Error('PUMA_AMBIGUOUS_SIZE_GUIDE');
          result[cells[us]] = cells[eu];
        }
        return result;
      })
      .filter((map) => Object.keys(map).length > 0);
    // Общая справка иногда вкладывает таблицу одежды в секцию Men's Shoes.
    // Буквенные размеры одежды не являются вторым вариантом обувной сетки.
    if (!maps.length) throw Error('PUMA_AMBIGUOUS_SIZE_GUIDE');
    if (
      maps.some(
        (m) =>
          JSON.stringify(Object.entries(m).sort()) !==
          JSON.stringify(Object.entries(maps[0]).sort()),
      )
    )
      throw Error('PUMA_AMBIGUOUS_SIZE_GUIDE');
    return maps[0];
  }, gender);
}

export async function collectPumaDetails(
  page,
  candidate,
  { checkAccess = async () => {}, delay = 2500, deadline = Date.now() + 120000 } = {},
) {
  if (!cookieHandlers.has(page)) {
    await page.addLocatorHandler(page.locator('#onetrust-accept-btn-handler'), async (button) => {
      await button.click();
    });
    cookieHandlers.add(page);
  }
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
  const conversion = await sizeMap(page, gender);
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
  const state = (await page.locator('#__NEXT_DATA__').count())
    ? await page
        .locator('#__NEXT_DATA__')
        .textContent()
        .then(JSON.parse)
        .catch(() => null)
    : null;
  const embedded = pumaEmbeddedVariants(state, candidate.sku, conversion, sizes, {
    sale: price(await page.locator('[data-test-id="item-sale-price-pdp"]').innerText()),
    old: price(await page.locator('[data-test-id="item-price-pdp"]').innerText()),
  });
  if (embedded)
    return {
      ...candidate,
      name: product.name,
      image_url: product.image?.[0] || candidate.image_url,
      gender,
      size_price_verified: true,
      variants: embedded,
      checked_at: new Date().toISOString(),
      old_price: Math.max(...embedded.map((v) => Number(v.originalPrice))),
      sale_price: Math.min(...embedded.map((v) => Number(v.salePrice))),
    };
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
    old_price: Math.max(...variants.map((v) => Number(v.originalPrice))),
    sale_price: Math.min(...variants.map((v) => Number(v.salePrice))),
    checked_at: new Date().toISOString(),
  };
}
