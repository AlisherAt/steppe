import { chromium } from '@playwright/test';
import robotsParser from 'robots-parser';
import { mkdir, writeFile, rename, readFile } from 'node:fs/promises';
import { fetchRobots } from './scraper-proxy.mjs';
import {
  nikeSaleUrl,
  nikeSaleCandidates,
  nikeProductUrl,
  nikeSnapshot,
  verifiedNikeProduct,
} from './nike-products.mjs';

export async function collectNike({
  deadline = Date.now() + 110 * 60_000,
  checkpoint = async () => {},
  discoveryOnly = false,
  outputDirectory = 'artifacts/nike-live',
} = {}) {
  const out = outputDirectory;
  await mkdir(out, { recursive: true });
  const robotResponse = await fetchRobots('https://www.nike.com/robots.txt');
  if (
    ![200, 404].includes(robotResponse.status) ||
    (robotResponse.status !== 404 && /^\s*</.test(robotResponse.body))
  )
    throw Error(`NIKE_ROBOTS_HTTP_${robotResponse.status}`);
  const robots = robotsParser(
    'https://www.nike.com/robots.txt',
    robotResponse.status === 404 ? '' : robotResponse.body,
  );
  const allowed = (url) =>
    new URL(url).origin === 'https://www.nike.com' &&
    robots.isAllowed(url, 'SteppeSaleCollector') !== false;
  if (!allowed(nikeSaleUrl)) throw Error('NIKE_ROBOTS_DISALLOWED');
  const delay = Math.max(1200, Number(robots.getCrawlDelay('SteppeSaleCollector') || 0) * 1000);
  if (delay > 60_000) throw Error('NIKE_CRAWL_DELAY_TOO_LONG');
  const browser = await chromium.launch({ headless: true });
  const candidates = new Map(),
    products = new Map(),
    groups = new Set();
  const state = {
    expectedGroups: 0,
    observedGroups: 0,
    discovered: 0,
    checked: 0,
    verified: 0,
    excluded: 0,
    failures: [],
    discoveryComplete: false,
    loadedAnchors: [0],
    lastPageSeen: false,
    startedAt: new Date().toISOString(),
  };
  const loadedAnchors = new Set([0]);
  let lastPageSeen = false;
  let blocked = '',
    pending = Promise.resolve();
  const recordGroups = (list) => {
    for (const g of list || []) {
      const key = g.products?.map((p) => p.groupKey).filter(Boolean)[0];
      if (key) groups.add(key);
    }
    for (const item of nikeSaleCandidates(list)) candidates.set(item.sku, item);
    state.observedGroups = groups.size;
    state.discovered = candidates.size;
  };
  const save = async () => {
    state.verified = products.size;
    await writeFile(`${out}/progress.tmp.json`, JSON.stringify(state, null, 2));
    await rename(`${out}/progress.tmp.json`, `${out}/progress.json`);
    await writeFile(
      `${out}/checkpoint.json`,
      JSON.stringify({ state, products: [...products.values()] }),
    );
    await checkpoint([...products.values()], state);
  };
  try {
    const context = await browser.newContext({
      locale: 'en-US',
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block',
    });
    await context.route('**/*', async (route) => {
      const r = route.request();
      if (['image', 'media', 'font'].includes(r.resourceType())) return route.abort();
      if (
        r.isNavigationRequest() &&
        r.resourceType() === 'document' &&
        !r.frame().parentFrame() &&
        !allowed(r.url())
      ) {
        blocked = 'NIKE_NAVIGATION_DISALLOWED';
        return route.abort();
      }
      await route.continue();
    });
    const visit = async (page, url) => {
      if (blocked) throw Error(blocked);
      if (!allowed(url)) throw Error('NIKE_ROBOTS_DISALLOWED');
      const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      if ([401, 403, 429].includes(r?.status())) {
        blocked = `NIKE_HTTP_${r.status()}`;
        throw Error(blocked);
      }
      if (!r?.ok()) throw Error(`NIKE_PAGE_HTTP_${r?.status() || 0}`);
      const text = await page.locator('body').innerText();
      if (
        /access denied|verify (?:that )?you are human|unusual traffic|robot check|checking your browser/i.test(
          text,
        )
      ) {
        blocked = 'NIKE_ACCESS_CHALLENGE';
        throw Error(blocked);
      }
    };
    if (process.env.NIKE_RESUME_DISCOVERY === '1') {
      const previous = JSON.parse(await readFile(`${out}/progress.json`, 'utf8'));
      if (Date.now() - Date.parse(previous.startedAt) > 2 * 3600000)
        throw Error('NIKE_DISCOVERY_EXPIRED');
      for (const item of JSON.parse(await readFile(`${out}/candidates.json`, 'utf8'))) {
        if (!nikeProductUrl(item.product_url) || item.sku !== item.product_url.split('/').pop())
          throw Error('NIKE_CANDIDATE_INVALID');
        candidates.set(item.sku, item);
      }
      state.expectedGroups = previous.expectedGroups;
      state.observedGroups = previous.observedGroups;
      state.discovered = candidates.size;
      state.discoveryComplete = previous.discoveryComplete;
    } else {
      const listing = await context.newPage();
      listing.on('response', (response) => {
        // Только ответы, запрошенные собственным интерфейсом магазина при прокрутке.
        if (!response.url().startsWith('https://api.nike.com/discover/product_wall/')) return;
        pending = pending
          .then(async () => {
            if ([401, 403, 429].includes(response.status())) {
              blocked = `NIKE_CATALOG_HTTP_${response.status()}`;
              return;
            }
            if (!response.ok()) return;
            const data = await response.json();
            await writeFile(`${out}/wall-response.json`, JSON.stringify(data));
            recordGroups(data.productGroupings || data.objects || []);
            loadedAnchors.add(Number(new URL(response.url()).searchParams.get('anchor') || 0));
            if (data.pages?.next === '') lastPageSeen = true;
            state.loadedAnchors = [...loadedAnchors].sort((a, b) => a - b);
            state.lastPageSeen = lastPageSeen;
            const required = Math.ceil(state.expectedGroups / 24);
            state.discoveryComplete =
              lastPageSeen &&
              Array.from({ length: required }, (_, i) => i * 24).every((n) => loadedAnchors.has(n));
          })
          .catch(() => {
            state.failures.push({ stage: 'catalog', code: 'NIKE_PAGE_RESPONSE_INVALID' });
          });
      });
      await visit(listing, nikeSaleUrl);
      await listing.waitForTimeout(2000);
      // Штатный выбор страны; авторизация/корзина Nike не используются.
      const us = listing.getByRole('dialog').locator('a').filter({ hasText: 'United States' });
      if ((await us.count()) && (await us.first().isVisible())) {
        await us.first().click();
        await listing.waitForTimeout(1500);
        await visit(listing, nikeSaleUrl);
      }
      const initial = await listing.locator('#__NEXT_DATA__').textContent();
      const wall = JSON.parse(initial).props.pageProps.initialState.Wall;
      state.expectedGroups = wall.pageData.totalResources;
      recordGroups(wall.productGroupings);
      let idle = 0,
        last = 0;
      for (let step = 0; step < 1200 && Date.now() < deadline && !blocked; step++) {
        await listing.evaluate(() => window.scrollBy(0, 700));
        await listing.waitForTimeout(Math.max(600, delay / 2));
        await pending;
        // DOM — резерв для версий ответа, которые не содержат productGroupings.
        const dom = await listing.locator('.product-card').evaluateAll((cards) =>
          cards.flatMap((card) => {
            const links = [...card.querySelectorAll('a[href]')].map((a) => a.href);
            return links;
          }),
        );
        for (const link of dom) {
          const url = nikeProductUrl(link),
            sku = url?.split('/').pop();
          if (url && !candidates.has(sku)) candidates.set(sku, { sku, product_url: url });
        }
        state.discovered = candidates.size;
        const reached = await listing.evaluate(
          () => innerHeight + scrollY >= document.body.scrollHeight - 80,
        );
        if (
          state.discoveryComplete ||
          (groups.size >= state.expectedGroups && state.expectedGroups > 0)
        ) {
          state.discoveryComplete = true;
          break;
        }
        if (reached) {
          idle = candidates.size === last ? idle + 1 : 0;
          last = candidates.size;
          if (idle >= 12) break;
          await listing.evaluate(() => window.scrollBy(0, -900));
          await listing.waitForTimeout(delay);
        }
        if (step % 20 === 0) {
          await save();
          console.log(JSON.stringify({ source: 'nike', event: 'discovery', ...state }));
        }
      }
      await pending;
      await writeFile(`${out}/candidates.json`, JSON.stringify([...candidates.values()], null, 2));
      await listing.close();
    }
    if (blocked) throw Error(blocked);
    if (discoveryOnly) {
      state.finishedAt = new Date().toISOString();
      await save();
      return { products: [], candidates: [...candidates.values()], status: 'partial', state };
    }
    console.log(
      JSON.stringify({
        source: 'nike',
        event: 'details',
        discovered: candidates.size,
        groups: groups.size,
        expected: state.expectedGroups,
      }),
    );
    const limit = Number(process.env.NIKE_DETAIL_LIMIT || 10000);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw Error('NIKE_LIMIT_INVALID');
    const queue = [...candidates.values()].slice(0, limit);
    // Два браузерных окна, не более одного нового перехода за delay мс суммарно.
    let cursor = 0,
      nextVisit = 0;
    const worker = async () => {
      const page = await context.newPage();
      try {
        while (cursor < queue.length && Date.now() < deadline && !blocked) {
          const candidate = queue[cursor++];
          const at = Math.max(Date.now(), nextVisit);
          nextVisit = at + delay;
          await page.waitForTimeout(Math.max(0, at - Date.now()));
          try {
            await visit(page, candidate.product_url);
            await page
              .waitForFunction(
                () => {
                  const scripts = [
                    ...document.querySelectorAll('script[type="application/ld+json"]'),
                  ];
                  return (
                    scripts.some((s) => s.textContent.includes('schema.org/InStock')) ||
                    /Sold Out|currently unavailable/.test(
                      document.querySelector('main')?.textContent || '',
                    )
                  );
                },
                {},
                { timeout: 12000 },
              )
              .catch(() => {});
            const snapshot = await nikeSnapshot(page);
            const product = verifiedNikeProduct(snapshot, candidate.product_url);
            if (product) {
              products.set(product.sku, product);
              await writeFile(`${out}/${product.sku}.json`, JSON.stringify(snapshot));
            } else state.excluded++;
          } catch (error) {
            state.failures.push({
              sku: candidate.sku,
              code: /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'NIKE_DETAIL_FAILED',
            });
          }
          state.checked++;
          state.verified = products.size;
          if (state.checked % 10 === 0) {
            // Один поток записи исключает столкновение временных файлов двух окон.
            pending = pending.then(save);
            await pending;
            console.log(
              JSON.stringify({
                source: 'nike',
                event: 'progress',
                checked: state.checked,
                verified: products.size,
                total: queue.length,
                failed: state.failures.length,
              }),
            );
          }
        }
      } finally {
        await page.close();
      }
    };
    await Promise.all([worker(), worker()]);
    state.finishedAt = new Date().toISOString();
    const complete =
      state.discoveryComplete &&
      state.checked === candidates.size &&
      !state.failures.length &&
      !blocked;
    const result = {
      products: [...products.values()],
      status: blocked
        ? 'error'
        : complete
          ? 'finished_observed_pages'
          : products.size
            ? 'partial'
            : 'no_valid_products',
      ...(blocked ? { error: blocked } : {}),
      state,
    };
    await save();
    await writeFile(`${out}/result.json`, JSON.stringify(result, null, 2));
    return result;
  } finally {
    await browser.close();
  }
}
