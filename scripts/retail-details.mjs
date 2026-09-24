import { price } from './scraper-extract.mjs';
export async function structuredProducts(page) {
  return page.locator('script[type="application/ld+json"]').evaluateAll((nodes) => {
    const out = [];
    function walk(v) {
      if (!v || typeof v !== 'object') return;
      if (['Product', 'ProductGroup'].includes(v['@type'])) out.push(v);
      for (const c of Object.values(v))
        if (c && typeof c === 'object') Array.isArray(c) ? c.forEach(walk) : walk(c);
    }
    for (const n of nodes) {
      try {
        walk(JSON.parse(n.textContent));
      } catch {}
    }
    return out;
  });
}
const money = (v) => (Number.isSafeInteger(v) && v > 0 ? (v / 100).toFixed(2) : null);
const genderOf = (s) =>
  /women|female/i.test(s)
    ? 'women'
    : /men|male/i.test(s)
      ? 'men'
      : /kids|junior|youth/i.test(s)
        ? 'kids'
        : 'unisex';
const prefix = (g) => (g === 'women' ? 'W' : g === 'kids' ? 'K' : 'M');
function result(source, product, variants) {
  if (!variants.length) throw Error('NO_VERIFIED_VARIANTS');
  return {
    source: source.id,
    brand: source.brand,
    ...product,
    currency: source.id === 'fila' ? 'EUR' : 'USD',
    size_price_verified: true,
    variants,
    old_price: Math.max(...variants.map((v) => Number(v.originalPrice))),
    sale_price: Math.min(...variants.map((v) => Number(v.salePrice))),
    checked_at: new Date().toISOString(),
  };
}
export function reebokVariants(product, offers, availableLabels, now = new Date().toISOString()) {
  if (product.vendor !== 'Reebok' || product.type !== 'Shoes' || product.requires_selling_plan)
    throw Error('NOT_RETAIL_SHOES');
  const gender = product.tags?.includes('unisex')
    ? 'unisex'
    : genderOf((product.tags || []).join(' '));
  const variants = [];
  for (const v of product.variants || []) {
    if (!v.available || v.requires_selling_plan || !availableLabels.includes(v.option2)) continue;
    const o = offers.find((o) => new URL(o.url).searchParams.get('variant') === String(v.id));
    const sale = money(v.price),
      old = money(v.compare_at_price);
    if (
      !o ||
      o.priceCurrency !== 'USD' ||
      !o.availability?.replaceAll(' ', '').endsWith('/InStock') ||
      Number(o.price) !== Number(sale) ||
      !sale ||
      !old ||
      Number(sale) >= Number(old)
    )
      continue;
    const m = /^M (\d+(?:\.\d+)?)/.exec(v.option2),
      w = /^W (\d+(?:\.\d+)?)/.exec(v.option2),
      numeric = /^\d+(?:\.\d+)?$/.test(v.option2) ? v.option2 : null;
    const size = m
      ? `US M ${m[1]}`
      : w
        ? `US W ${w[1]}`
        : numeric
          ? `US ${prefix(gender)} ${numeric}`
          : null;
    if (size)
      variants.push({
        id: String(v.id),
        size,
        salePrice: sale,
        originalPrice: old,
        available: true,
        checkedAt: now,
      });
  }
  return variants;
}
export async function collectReebok(page, source) {
  await page.locator('script[data-product-json]').waitFor({ state: 'attached', timeout: 15000 });
  await page.locator('button.option2').first().waitFor({ timeout: 10000 });
  const product = JSON.parse(await page.locator('script[data-product-json]').first().textContent());
  const ld = (await structuredProducts(page)).find(
    (p) => p['@type'] === 'Product' && p.name === product.title && Array.isArray(p.offers),
  );
  if (!ld) throw Error('PRODUCT_OFFERS_MISSING');
  const labels = await page
    .locator('button.option2:not(.unavailable)')
    .evaluateAll((nodes) =>
      nodes
        .filter(
          (e) =>
            e.getClientRects().length && / is available$/.test(e.getAttribute('aria-label') || ''),
        )
        .map((e) => e.textContent.trim()),
    );
  const variants = reebokVariants(product, ld.offers, labels);
  const styles = new Set(product.variants.map((v) => /^\d{9}(?=-|$)/.exec(v.sku)?.[0]));
  if (styles.size !== 1 || styles.has(undefined)) throw Error('AMBIGUOUS_STYLE');
  const gender = /Unisex/.test(await page.locator('main').innerText())
    ? 'unisex'
    : genderOf(product.tags.join(' '));
  return result(
    source,
    {
      sku: [...styles][0],
      name: product.title,
      gender,
      product_url: `https://www.reebok.com/products/${product.handle}`,
      image_url: new URL(product.featured_image || product.images[0], page.url()).href,
    },
    variants,
  );
}
export async function collectOn(
  page,
  source,
  { delay = 2000, checkAccess = async () => {}, deadline = Date.now() + 120000 } = {},
) {
  const products = await structuredProducts(page),
    product = products.find((p) => p['@type'] === 'Product' && p.offers?.url === page.url());
  if (!product || product.offers.priceCurrency !== 'USD' || !page.url().includes('-shoes-'))
    throw Error('ON_PRODUCT_MISSING');
  const old = price(product.offers.priceSpecification?.price),
    sale = price(product.offers.price);
  if (old === null || sale === null || sale >= old) throw Error('NO_CONFIRMED_DISCOUNT');
  const gender = genderOf(product.name),
    variants = [];
  await page.addLocatorHandler(
    page.getByRole('button', { name: /^Accept all cookies$/i }),
    async (b) => {
      await b.click();
    },
  );
  const picker = page.locator('[data-test-id="purchasePodSelectSizeButton"]');
  await page.addLocatorHandler(
    page
      .getByRole('alertdialog', { name: "Don't miss a step" })
      .getByRole('button', { name: 'Close', exact: true }),
    async (button) => {
      await button.click();
    },
  );
  await picker.waitFor({ timeout: 15000 });
  await picker.click();
  const sizes = await page.locator('[data-test-id="purchasePodSizeButton"]').evaluateAll((nodes) =>
    nodes
      .filter(
        (e) =>
          !e.disabled &&
          e.getAttribute('aria-disabled') !== 'true' &&
          !/unavailable|notify|sold out/i.test(e.textContent + ' ' + e.getAttribute('aria-label')),
      )
      .map((e) => e.querySelector('[data-wk-name="purchasePodSizeOption"]')?.textContent.trim())
      .filter((v) => /^\d+(\.\d+)?$/.test(v || '')),
  );
  for (const size of sizes) {
    if (Date.now() > deadline) break;
    await checkAccess();
    if ((await picker.getAttribute('aria-expanded')) !== 'true') await picker.click();
    const option = page.locator('[data-test-id="purchasePodSizeButton"]').filter({
      has: page.locator('[data-wk-name="purchasePodSizeOption"]', {
        hasText: new RegExp(`^${size.replace('.', '\\.')}$`),
      }),
    });
    await option.click();
    await page.waitForTimeout(delay);
    await checkAccess();
    const selected = await picker.innerText();
    if (!selected.includes(size)) throw Error('ON_SIZE_NOT_SELECTED');
    const add = page.getByRole('button', { name: /^Add to bag$/i });
    if (!(await add.isEnabled())) continue;
    const text = await page.locator('main').innerText();
    const m = /Current price\s*\$([\d,.]+)\s*original price\s*\$([\d,.]+)/i.exec(text);
    if (!m || price(m[1]) !== sale || price(m[2]) !== old) throw Error('ON_PRICE_MISMATCH');
    variants.push({
      id: `${product.sku}-${size}`,
      size: `US ${prefix(gender)} ${size}`,
      salePrice: sale.toFixed(2),
      originalPrice: old.toFixed(2),
      available: true,
      checkedAt: new Date().toISOString(),
    });
  }
  return result(
    source,
    {
      sku: product.sku,
      name: product.name,
      gender,
      product_url: product.offers.url,
      image_url: product.image,
    },
    variants,
  );
}
export async function collectBrooks(
  page,
  source,
  {
    delay = 2000,
    checkAccess = async () => {},
    allowed = /** @type {(url: string) => boolean} */ (() => false),
    deadline = Date.now() + 120000,
  } = {},
) {
  const product = (await structuredProducts(page)).find((p) => p.offers?.priceCurrency === 'USD');
  if (!product || !page.url().includes('/shoes/')) throw Error('BROOKS_PRODUCT_MISSING');
  await page.addLocatorHandler(page.locator('#onetrust-accept-btn-handler'), async (button) => {
    await button.click();
  });
  const width = await page
    .locator('[data-attr="width"][data-attr-selected="true"]')
    .getAttribute('data-attr-value');
  const color = await page
    .locator('[data-attr="color"][data-attr-selected="true"]')
    .getAttribute('data-attr-value');
  if (!/^[A-Z0-9]+$/.test(width || '') || !/^\d+$/.test(color || ''))
    throw Error('BROOKS_VARIANT_MISSING');
  const gender = genderOf(product.category),
    variants = [];
  const sizes = await page
    .locator('button[data-attr="size_Shoe"]:not(.m-buy-box-grid__btn--sold-out)')
    .evaluateAll((nodes) =>
      nodes.map((e) => ({
        id: e.getAttribute('data-attr-value'),
        size: e.textContent.trim(),
        url: e.getAttribute('data-url'),
      })),
    );
  for (const s of sizes) {
    if (Date.now() > deadline) break;
    if (!/^\d+(\.\d+)?$/.test(s.size) || !allowed(s.url)) continue;
    await checkAccess();
    const button = page.locator(`button[data-attr="size_Shoe"][data-attr-value="${s.id}"]`);
    await button.click();
    await page.waitForTimeout(delay);
    await checkAccess();
    if ((await button.getAttribute('aria-current')) !== 'true')
      throw Error('BROOKS_SIZE_NOT_SELECTED');
    const add = page.locator('button[data-add-to-cart]').first();
    if ((await add.getAttribute('class'))?.includes('--disabled') || !(await add.isEnabled()))
      continue;
    const m = /Original price\s*\$([\d,.]+)\s*Current price\s*\$([\d,.]+)/i.exec(
      await page.locator('main').innerText(),
    );
    if (!m) continue;
    const old = price(m[1]),
      sale = price(m[2]);
    if (old === null || sale === null || sale >= old) continue;
    variants.push({
      id: `${product.sku}_${color}_${width}_${s.id}`,
      size: `US ${prefix(gender)} ${Number(s.size)} ${width}`,
      salePrice: sale.toFixed(2),
      originalPrice: old.toFixed(2),
      available: true,
      checkedAt: new Date().toISOString(),
    });
  }
  const url = new URL(page.url());
  url.searchParams.set(`dwvar_${product.sku}_color`, color);
  url.searchParams.set(`dwvar_${product.sku}_width`, width);
  return result(
    source,
    {
      sku: `${product.sku}_${color}_${width}`,
      name: `${product.name} · ${color} / ${width}`,
      gender,
      product_url: url.href,
      image_url: product.image[0],
    },
    variants,
  );
}
export async function collectFila(page, source) {
  await page
    .locator('a.selectSize[data-sku]')
    .first()
    .waitFor({ state: 'attached', timeout: 15000 });
  const data = await page.evaluate(() => {
    const value = (name) => {
      const e = document.querySelector(`[itemprop="${name}"]`);
      return e?.getAttribute('content') || e?.textContent.trim();
    };
    const sku = value('sku');
    // Суффикс ревизии V2 есть в артикуле, но имя опубликованного изображения
    // использует базовый номер. Сам артикул и вариант сохраняются полностью.
    const imageSku = sku?.replace(/-V\d+$/i, '');
    const images = [...document.querySelectorAll('img')].filter(
      (e) => imageSku && (e.currentSrc || e.src).includes(imageSku),
    );
    images.sort((a, b) => b.naturalWidth - a.naturalWidth);
    return {
      sku,
      name: value('name'),
      currency: value('priceCurrency'),
      image: images[0]?.currentSrc || images[0]?.src,
      variants: [...document.querySelectorAll('.size:not(.inactive) > a.selectSize[data-sku]')]
        .filter(
          (e) =>
            !e.querySelector('.soldout') &&
            !e.classList.contains('disabled') &&
            e.getAttribute('aria-disabled') !== 'true',
        )
        .map((e) => ({
          id: e.dataset.sku,
          size: e.dataset.sizeOriginal,
          sale: e.dataset.price,
          old: e.dataset.tprice,
        })),
    };
  });
  if (data.currency !== 'EUR' || !data.sku || !data.name || !data.image)
    throw Error('FILA_PRODUCT_MISSING');
  const variants = data.variants.flatMap((v) => {
    const euro = (value) => price(String(value || '').replace(/^€\s*|\s*€$/g, ''));
    const sale = euro(v.sale),
      old = euro(v.old);
    if (
      !/^\d+(?:\.\d+)?$/.test(v.size || '') ||
      !v.id?.startsWith(data.sku + '-') ||
      sale === null ||
      old === null ||
      sale <= 0 ||
      sale >= old
    )
      return [];
    return [
      {
        id: v.id,
        size: `EU ${v.size}`,
        salePrice: sale.toFixed(2),
        originalPrice: old.toFixed(2),
        available: true,
        checkedAt: new Date().toISOString(),
      },
    ];
  });
  const gender = page.url().includes('/Damen/')
    ? 'women'
    : page.url().includes('/Herren/')
      ? 'men'
      : page.url().includes('/Kinder/')
        ? 'kids'
        : 'unisex';
  return result(
    source,
    { sku: data.sku, name: data.name, gender, product_url: page.url(), image_url: data.image },
    variants,
  );
}
export async function discoverRetail(page, source) {
  const urls = await page.evaluate(
    (id) =>
      [...document.querySelectorAll('a[href]')]
        .filter((a) =>
          id === 'reebok'
            ? !!a.closest('.product-grid-item') && a.href.includes('/products/')
            : id === 'on'
              ? a.href.includes('/en-us/products/') && a.href.includes('-shoes-')
              : id === 'brooks'
                ? a.href.includes('/shoes/') && a.href.includes('.html')
                : id === 'fila'
                  ? a.href.includes('/Schuhe/Sneaker/') && a.href.endsWith('.html')
                  : a.href.includes('.html') && /\/\d+_[A-Z]+\.html/.test(a.href),
        )
        .map((a) => a.href),
    source.id,
  );
  // Один товар Reebok встречается и в /collections/.../products/, и в /products/.
  const canonical = urls.map((value) => {
    const url = new URL(value);
    if (source.id === 'reebok')
      url.pathname = url.pathname.replace(/^\/collections\/[^/]+(?=\/products\/)/, '');
    return url.href;
  });
  return [...new Set(canonical)]
    .filter((u) => new URL(u).origin === new URL(source.url).origin)
    .slice(0, 30);
}
