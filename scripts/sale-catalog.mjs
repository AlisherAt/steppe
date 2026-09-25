import { extract } from './scraper-extract.mjs';
import { collectPumaDetails } from './puma-details.mjs';
import { collectReebok } from './retail-details.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

export function nextSalePage(current, href, source) {
  const next = new URL(href, current),
    start = new URL(source.url);
  if (next.origin !== start.origin || next.pathname !== start.pathname)
    throw Error('INVALID_SALE_PAGE');
  // Puma убирает фильтры из ссылки Next. Сохраняем исходный выбор пользователя.
  for (const [key, value] of start.searchParams)
    if (key.startsWith('filter_')) next.searchParams.set(key, value);
  return next.href;
}
export function sneakerName(text) {
  return (
    /\b(shoes?|sneakers?|trainers?)\b/i.test(text) &&
    !/\b(slides?|sandals?|boots?|cleats?|socks?|insoles?)\b/i.test(text)
  );
}

export async function pumaListing(page, html, source) {
  return page.evaluate(
    ({ html, base }) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const items = [...doc.querySelectorAll('[data-test-id="product-list-item"]')].flatMap(
        (card) => {
          const sku = card.getAttribute('data-product-id'),
            href = card.querySelector('a')?.getAttribute('href');
          if (!/^\d{6}_\d{2}$/.test(sku || '') || !href) return [];
          const url = new URL(href, base);
          if (url.origin !== new URL(base).origin || !url.pathname.startsWith('/us/en/pd/'))
            return [];
          return [
            {
              source: 'puma',
              brand: 'Puma',
              sku,
              product_url: url.href,
              name: [...card.querySelectorAll('h2,h3')].map((n) => n.textContent.trim()).join(' '),
              image_url: card.querySelector('img')?.getAttribute('src') || '',
              currency: 'USD',
            },
          ];
        },
      );
      const next = [...doc.querySelectorAll('main a')]
        .find((a) => a.textContent.trim() === 'Next')
        ?.getAttribute('href');
      return { items, next };
    },
    { html, base: source.url },
  );
}

export async function collectSaleCatalog(
  page,
  source,
  { allowed, checkAccess, delay, deadline, initialHtml, checkpoint = async () => {} },
) {
  const candidates = new Map(),
    observed = new Set(),
    visited = new Set();
  let expected = 0,
    discoveryComplete = false,
    idle = 0,
    pages = 0;
  const wait = () => page.waitForTimeout(Math.max(delay, 1800));
  await mkdir('artifacts/diagnostics', { recursive: true });
  for (let step = 0; step < 100 && Date.now() < deadline; step++) {
    await wait();
    await checkAccess();
    pages++;
    if (source.id === 'reebok') {
      const pageNumber = Number(new URL(page.url()).searchParams.get('current') || 1);
      await page.waitForFunction(
        ({ expected, pageNumber }) => {
          const main = document.querySelector('main');
          const total = Number(/SALE\s*\((\d+)\)/i.exec(main?.textContent || '')?.[1] || expected);
          return (
            total > 0 &&
            document.querySelectorAll('main .product-grid-item').length >=
              Math.min(16, total - (pageNumber - 1) * 16)
          );
        },
        { expected, pageNumber },
        { timeout: 25000 },
      );
    }
    const text = await page.locator('main').innerText();
    expected ||= Number(
      (source.id === 'puma' ? /(\d+)\s+PRODUCTS/i : /SALE\s*\((\d+)\)/i).exec(text)?.[1] || 0,
    );
    const before = observed.size;
    let pumaPage;
    if (source.id === 'puma') {
      pumaPage = initialHtml ? await pumaListing(page, initialHtml, source) : null;
      if (pumaPage?.items.length) {
        for (const p of pumaPage.items) {
          observed.add(p.sku);
          if (sneakerName(p.name)) candidates.set(p.sku, p);
        }
      } else {
        await page.waitForTimeout(3000);
        for (const id of await page
          .locator('[data-test-id="product-list-item"]')
          .evaluateAll((ns) => ns.map((n) => n.getAttribute('data-product-id')).filter(Boolean)))
          observed.add(id);
        for (const p of await extract(page, source)) candidates.set(p.sku, p);
      }
    } else {
      const rows = await page.locator('main .product-grid-item').evaluateAll((ns) =>
        ns.map((n) => ({
          text: n.textContent,
          urls: [...n.querySelectorAll('a[href]')].map((a) => a.href),
        })),
      );
      for (const row of rows) {
        const link = row.urls.find(
          (u) =>
            new URL(u).origin === 'https://www.reebok.com' &&
            new URL(u).pathname.includes('/products/'),
        );
        if (!link) continue;
        const u = new URL(link);
        u.pathname = u.pathname.replace(/^\/collections\/[^/]+(?=\/products\/)/, '');
        u.search = '';
        u.hash = '';
        observed.add(u.href);
        if (sneakerName(row.text)) candidates.set(u.href, { product_url: u.href });
      }
    }
    console.log(
      JSON.stringify({
        source: source.id,
        event: 'listing',
        observed: observed.size,
        expected,
        candidates: candidates.size,
      }),
    );
    await writeFile(
      `artifacts/diagnostics/${source.id}-collection.json`,
      JSON.stringify(
        {
          expected,
          observed: [...observed],
          candidates: [...candidates.values()],
          discoveryComplete: false,
          pages,
        },
        null,
        2,
      ),
    );
    if (expected && observed.size >= expected) {
      discoveryComplete = true;
      break;
    }
    idle = before === observed.size ? idle + 1 : 0;
    if (source.id === 'puma') {
      const href = pumaPage?.items.length
        ? pumaPage.next
        : await page
            .locator('main a')
            .filter({ hasText: /^Next$/ })
            .first()
            .getAttribute('href')
            .catch(() => null);
      if (!href) {
        discoveryComplete = !expected || observed.size >= expected;
        break;
      }
      const next = nextSalePage(page.url(), href, source);
      if (visited.has(next)) break;
      if (!allowed(next)) throw Error('PAGINATION_ROBOTS_DISALLOWED');
      visited.add(next);
      const response = await page.goto(next, { waitUntil: 'domcontentloaded' });
      if (!response?.ok()) throw Error(`PAGE_HTTP_${response?.status() || 0}`);
      initialHtml = await response.text();
    } else {
      if (idle >= 3) break;
      // Магазин использует current при бесконечной прокрутке. Отдельная
      // навигация не накапливает сотни тяжёлых карточек в одной вкладке.
      const next = new URL(source.url);
      next.searchParams.set('current', String(step + 2));
      if (expected && (step + 1) * 16 >= expected) break;
      if (!allowed(next.href)) throw Error('PAGINATION_ROBOTS_DISALLOWED');
      const response = await page.goto(next.href, { waitUntil: 'domcontentloaded' });
      if (!response?.ok()) throw Error(`PAGE_HTTP_${response?.status() || 0}`);
    }
  }
  await mkdir('artifacts/diagnostics', { recursive: true });
  await writeFile(
    `artifacts/diagnostics/${source.id}-collection.json`,
    JSON.stringify(
      {
        expected,
        observed: [...observed],
        candidates: [...candidates.values()],
        discoveryComplete,
        pages,
      },
      null,
      2,
    ),
  );
  const products = new Map(),
    errors = [];
  let resume = [];
  if (process.env.SCRAPER_RESUME_REPORT) {
    const previous = JSON.parse(await readFile(process.env.SCRAPER_RESUME_REPORT, 'utf8'));
    resume = previous.products.filter(
      (p) =>
        p.source === source.id &&
        p.size_price_verified &&
        Date.now() - Date.parse(p.checked_at) >= 0 &&
        Date.now() - Date.parse(p.checked_at) < 2 * 3600000,
    );
  }
  let attempted = 0;
  for (const candidate of candidates.values()) {
    if (Date.now() + 20000 > deadline) break;
    if (!allowed(candidate.product_url)) {
      errors.push({ url: candidate.product_url, code: 'ROBOTS_DISALLOWED' });
      continue;
    }
    attempted++;
    try {
      const prior = resume.find(
        (p) =>
          p.product_url === candidate.product_url &&
          p.variants?.length &&
          (candidate.sale_price === undefined ||
            (p.sale_price === candidate.sale_price && p.old_price === candidate.old_price)),
      );
      if (prior) {
        products.set(prior.sku, prior);
        continue;
      }
      await wait();
      const response = await page.goto(candidate.product_url, { waitUntil: 'domcontentloaded' });
      if (!response?.ok()) throw Error(`PAGE_HTTP_${response?.status() || 0}`);
      await checkAccess();
      const product =
        source.id === 'puma'
          ? await collectPumaDetails(page, candidate, { checkAccess, delay, deadline })
          : await collectReebok(page, source);
      if (!sneakerName(product.name)) throw Error('NOT_SNEAKERS');
      products.set(product.sku, product);
      console.log(
        JSON.stringify({
          source: source.id,
          event: 'verified',
          attempted,
          total: candidates.size,
          count: products.size,
          sku: product.sku,
          sizes: product.variants.length,
        }),
      );
    } catch (e) {
      const code = /^[A-Z0-9_]+$/.test(e.message) ? e.message : 'DETAIL_UNAVAILABLE';
      errors.push({ url: candidate.product_url, code, message: e.message.slice(0, 350) });
      console.log(JSON.stringify({ source: source.id, event: 'detail_error', attempted, code }));
      if (errors.length <= 3)
        await page
          .screenshot({ path: `artifacts/diagnostics/${source.id}-full-${attempted}.png` })
          .catch(() => {});
      if (/HTTP_40[13]|HTTP_429|ACCESS_/.test(code)) break;
    }
    await checkpoint([...products.values()], {
      expected,
      observed: observed.size,
      candidates: candidates.size,
      attempted,
      errors,
      discoveryComplete,
      pages,
    });
  }
  return {
    products: [...products.values()],
    expected,
    observed: observed.size,
    candidates: candidates.size,
    attempted,
    errors,
    discoveryComplete,
    pages,
    complete:
      discoveryComplete &&
      attempted === candidates.size &&
      errors.every((e) =>
        /^(NOT_RETAIL_SHOES|NOT_SNEAKERS|NO_VERIFIED_VARIANTS|PUMA_NO_VERIFIED_SIZES)$/.test(
          e.code,
        ),
      ),
  };
}
