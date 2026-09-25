import { price } from './scraper-extract.mjs';

// Читаем только выбранный вариант публичной карточки. Покупку не выполняем.
// Селекторы требуют проверки на живом магазине после снятия HTTP 403 со стороны adidas.
export async function collectAdidasDetails(
  page,
  candidate,
  { checkAccess = async () => {}, delay = 2500, deadline = Date.now() + 120000 } = {},
) {
  const url = new URL(page.url());
  if (
    url.origin !== 'https://www.adidas.com' ||
    !/^\/us\/[^/]+\/[A-Z0-9]{6}\.html$/.test(url.pathname) ||
    !url.pathname.endsWith(`/${candidate.sku}.html`)
  )
    throw Error('ADIDAS_PRODUCT_MISMATCH');
  await checkAccess();
  const main = page.locator('main');
  const titles = await main.locator('h1:visible').allTextContents();
  const normalize = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!titles.length || titles.some((t) => normalize(t) !== normalize(candidate.name)))
    throw Error('ADIDAS_NAME_MISMATCH');
  if (!/shoes|sneakers/i.test(candidate.name)) throw Error('NOT_RETAIL_SHOES');
  const text = await main.innerText();
  const gender = /women['’]?s/i.test(text)
    ? 'women'
    : /men['’]?s/i.test(text)
      ? 'men'
      : /kids|junior|youth/i.test(text)
        ? 'kids'
        : 'unisex';
  const sizes = main.locator(
    '[data-auto-id="size-selector"] button:visible, button[data-auto-id="size-selector-item"]:visible',
  );
  await sizes.first().waitFor({ timeout: 15000 });
  const labels = [...new Set((await sizes.allTextContents()).map((s) => s.trim()))];
  const variants = [];
  for (const label of labels.slice(0, 60)) {
    if (Date.now() + delay + 1000 >= deadline) break;
    // US → EU не вычисляется. Буквенные детские/двойные размеры пока пропускаются.
    if (!/^\d+(?:\.\d+)?$/.test(label)) continue;
    const button = sizes
      .filter({ hasText: new RegExp(`^\\s*${label.replace('.', '\\.')}\\s*$`) })
      .first();
    if (!(await button.isEnabled()) || (await button.getAttribute('aria-disabled')) === 'true')
      continue;
    if (/out.of.stock|unavailable|disabled/i.test((await button.getAttribute('class')) || ''))
      continue;
    await checkAccess();
    await button.click();
    await page.waitForTimeout(delay);
    await checkAccess();
    if (new URL(page.url()).pathname !== url.pathname) throw Error('ADIDAS_PRODUCT_MISMATCH');
    const selected = await button.evaluate(
      (e) =>
        ['aria-pressed', 'aria-selected', 'aria-checked'].some(
          (a) => e.getAttribute(a) === 'true',
        ) || [...e.classList].some((c) => /^(?:selected|.*__selected)(?:_|$)/.test(c)),
    );
    if (
      !selected ||
      !(await button.isEnabled()) ||
      (await button.getAttribute('aria-disabled')) === 'true'
    )
      continue;
    const add = main.locator('button[data-auto-id="add-to-bag"]:visible').first();
    if (
      !(await add.isVisible()) ||
      !(await add.isEnabled()) ||
      (await add.getAttribute('aria-disabled')) === 'true'
    )
      continue;
    const read = async (selector) => {
      const values = await main.locator(selector).allTextContents();
      if (!values.length || values.some((v) => !v.includes('$'))) return null;
      const numbers = values.map((v) => price(v.trim()));
      return numbers.every((v) => v !== null && v === numbers[0]) ? numbers[0] : null;
    };
    const sale = await read('.gl-price-item--sale:visible');
    const old = await read('.gl-price-item--crossed:visible');
    if (sale === null || old === null || sale <= 0 || sale >= old) continue;
    const size = `US ${gender === 'men' ? 'M ' : gender === 'women' ? 'W ' : gender === 'kids' ? 'K ' : ''}${label}`;
    variants.push({
      id: `${candidate.sku}:${size}`,
      size,
      salePrice: sale.toFixed(2),
      originalPrice: old.toFixed(2),
      available: true,
      checkedAt: new Date().toISOString(),
    });
  }
  if (!variants.length) throw Error('ADIDAS_NO_VERIFIED_VARIANTS');
  return {
    ...candidate,
    source: 'adidas',
    brand: 'Adidas',
    product_url: url.origin + url.pathname,
    currency: 'USD',
    gender,
    size_price_verified: true,
    variants,
    sale_price: Math.min(...variants.map((v) => Number(v.salePrice))),
    old_price: Math.max(...variants.map((v) => Number(v.originalPrice))),
    checked_at: new Date().toISOString(),
  };
}
