import { chromium, request } from '@playwright/test';
import robotsParser from 'robots-parser';
import { mkdir, writeFile } from 'node:fs/promises';
import { clothingSources, reebokClothing, pumaClothing, uniqloFeedProducts } from './products.mjs';
import { pumaListing, nextSalePage } from '../sale-catalog.mjs';
import { collectUniqlo } from './uniqlo.mjs';
import { collectNike } from '../nike-collector.mjs';

// Независимый сбор одного магазина. Ошибка одного источника не останавливает другие.
const key = process.argv[2];
const source = clothingSources[key];
if (!source) throw Error('UNKNOWN_CLOTHING_SOURCE');
const limit = Number(process.env.CLOTHING_DETAIL_LIMIT || 10000);
if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw Error('INVALID_LIMIT');
const minutes = Number(process.env.CLOTHING_MAX_MINUTES || 100);
if (!Number.isFinite(minutes) || minutes < 1 || minutes > 110) throw Error('INVALID_TIME_LIMIT');
const deadline = Date.now() + minutes * 60000;
const out = `artifacts/clothing-${key}`;
await mkdir(out, { recursive: true });
const report = {
  version: 1,
  runId: `clothing-${key}-${Date.now()}`,
  source: key,
  checkedAt: new Date().toISOString(),
  status: 'error',
  complete: false,
  products: [],
  errors: [],
};
const save = () => writeFile(out + '/report.json', JSON.stringify(report));
let browser;
try {
  if (key.startsWith('uniqlo-')) {
    const prefix = key === 'uniqlo-jp' ? 'UNIQLO_JP' : 'UNIQLO_KR',
      feed = process.env[prefix + '_FEED_URL'];
    if (feed) {
      // Разрешённый фид — независимая альтернатива региональному API.
      const u = new URL(feed),
        hosts = (process.env[prefix + '_FEED_HOSTS'] || '').split(',').map((s) => s.trim());
      if (
        u.protocol !== 'https:' ||
        u.username ||
        u.password ||
        !hosts.includes(u.hostname) ||
        !process.env[prefix + '_FEED_PERMISSION']
      )
        throw Error('UNIQLO_FEED_NOT_AUTHORIZED');
      const client = await request.newContext();
      try {
        const r = await client.get(u.href, {
          timeout: 30000,
          maxRedirects: 0,
          headers: process.env[prefix + '_FEED_TOKEN']
            ? { Authorization: `Bearer ${process.env[prefix + '_FEED_TOKEN']}` }
            : {},
        });
        if (!r.ok()) throw Error('UNIQLO_FEED_HTTP_' + r.status());
        const buffer = await r.body();
        if (buffer.length > 20000000) throw Error('UNIQLO_FEED_TOO_LARGE');
        const data = JSON.parse(buffer.toString());
        report.products = uniqloFeedProducts(data, key);
        report.complete = data.complete === true;
      } finally {
        await client.dispose();
      }
    } else {
      const result = await collectUniqlo(key, {
        deadline,
        limit,
        checkpoint: async (products) => {
          report.products = products;
          report.status = 'partial';
          await save();
        },
      });
      Object.assign(report, result);
    }
    report.status = report.complete
      ? 'complete'
      : report.products.length
        ? 'partial'
        : 'no_valid_products';
  } else if (key === 'nike') {
    const result = await collectNike({
      productType: 'APPAREL',
      discoveryLimit: limit,
      deadline,
      outputDirectory: out + '/nike',
      checkpoint: async (products) => {
        report.products = products;
        report.status = 'partial';
        await save();
      },
    });
    report.products = result.products;
    report.complete = result.status === 'finished_observed_pages';
    report.status = result.status;
    report.errors = result.state.failures;
    if (result.error) report.error = result.error;
  } else {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ locale: 'en-US', serviceWorkers: 'block' });
    const page = await context.newPage();
    const origin = new URL(source.url).origin;
    const r = await context.request.get(origin + '/robots.txt', {
      timeout: 20000,
      maxRedirects: 0,
    });
    const body = await r.text();
    if (![200, 404].includes(r.status()) || (r.status() !== 404 && /^\s*</.test(body)))
      throw Error('ROBOTS_HTTP_' + r.status());
    const robots = robotsParser(origin + '/robots.txt', r.status() === 404 ? '' : body);
    const allowed = (url) => {
      const u = new URL(url);
      return u.origin === origin && robots.isAllowed(u.href, 'SteppeSaleCollector') !== false;
    };
    const delay = Math.max(1600, Number(robots.getCrawlDelay('SteppeSaleCollector') || 0) * 1000);
    if (delay > 60000) throw Error('CRAWL_DELAY_TOO_LONG');
    const check = async () => {
      const txt = await page.locator('body').innerText();
      if (
        /access denied|verify (?:that )?you are human|robot check|unusual traffic|checking your browser/i.test(
          txt,
        )
      )
        throw Error('ACCESS_CHALLENGE');
    };
    await context.route('**/*', async (route) => {
      const req = route.request();
      if (
        req.isNavigationRequest() &&
        req.resourceType() === 'document' &&
        !req.frame().parentFrame() &&
        !allowed(req.url())
      )
        return route.abort();
      return route.continue();
    });
    const visit = async (url) => {
      if (!allowed(url)) throw Error('ROBOTS_DISALLOWED');
      let failure;
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.waitForTimeout(delay * (attempt + 1));
        try {
          const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          if (!r?.ok()) {
            const e = Error('PAGE_HTTP_' + (r?.status() || 0));
            if ([401, 403, 429].includes(r?.status())) throw e;
            failure = e;
            continue;
          }
          await check();
          return await r.text();
        } catch (e) {
          if (/403|401|429|CHALLENGE|ROBOTS/.test(e.message)) throw e;
          failure = e;
        }
      }
      throw failure;
    };
    const products = new Map();
    const record = async (list) => {
      for (const p of list) products.set(p.sku, p);
      report.products = [...products.values()];
      report.status = 'partial';
      await save();
    };
    if (key === 'reebok') {
      await visit(source.url);
      await page.waitForFunction(() => window.Shopify?.currency?.active, {}, { timeout: 15000 });
      if ((await page.evaluate(() => window.Shopify.currency.active)) !== 'USD')
        throw Error('CURRENCY_MISMATCH');
      const seen = new Set();
      for (let index = 1; index <= 40 && Date.now() < deadline; index++) {
        const url = origin + `/collections/sale/products.json?limit=250&page=${index}`;
        if (!allowed(url)) throw Error('ROBOTS_DISALLOWED');
        await page.waitForTimeout(delay);
        const r = await context.request.get(url, { timeout: 30000, maxRedirects: 0 });
        if (!r.ok()) throw Error('FEED_HTTP_' + r.status());
        const buffer = await r.body();
        if (buffer.length > 12000000) throw Error('FEED_TOO_LARGE');
        const data = JSON.parse(buffer.toString());
        if (!Array.isArray(data.products)) throw Error('INVALID_FEED');
        for (const raw of data.products) {
          if (seen.has(raw.id)) throw Error('REPEATED_PAGE');
          seen.add(raw.id);
          await record(reebokClothing(raw));
        }
        console.log(JSON.stringify({ source: key, page: index, products: products.size }));
        if (data.products.length < 250) {
          report.complete = true;
          break;
        }
        if (products.size >= limit) break;
      }
    } else if (key === 'puma') {
      await page.addLocatorHandler(page.locator('#onetrust-accept-btn-handler'), async (button) =>
        button.click(),
      );
      let url = source.url;
      const seenPages = new Set(),
        candidates = new Map();
      let listingComplete = false;
      for (let i = 0; i < 100 && Date.now() < deadline && candidates.size < limit; i++) {
        if (seenPages.has(url)) throw Error('REPEATED_PAGE');
        seenPages.add(url);
        const html = await visit(url);
        const listing = await pumaListing(page, html, source);
        for (const p of listing.items) candidates.set(p.sku, p);
        console.log(
          JSON.stringify({
            source: key,
            event: 'listing',
            page: i + 1,
            candidates: candidates.size,
          }),
        );
        if (!listing.next) {
          listingComplete = true;
          break;
        }
        url = nextSalePage(url, listing.next, source);
      }
      let checked = 0;
      for (const candidate of [...candidates.values()].slice(0, limit)) {
        if (Date.now() > deadline) break;
        try {
          await visit(candidate.product_url);
          await page.locator('#size-picker').waitFor({ timeout: 12000 });
          await check();
          const snapshot = await page.evaluate(() => {
            const parse = (s) => {
              try {
                return JSON.parse(s);
              } catch {
                return null;
              }
            };
            const money = (s) => {
              const m = s?.match(/\$([\d,]+(?:\.\d{2})?)/);
              return m ? Number(m[1].replaceAll(',', '')) : null;
            };
            const add = document.querySelector('[data-test-id="add-to-cart-button"]');
            return {
              state: parse(document.querySelector('#__NEXT_DATA__')?.textContent),
              canAdd: !!add && !add.disabled,
              displayed: {
                sale: money(
                  document.querySelector('[data-test-id="item-sale-price-pdp"]')?.textContent,
                ),
                old: money(document.querySelector('[data-test-id="item-price-pdp"]')?.textContent),
              },
              sizes: [
                ...document.querySelectorAll('#size-picker label[data-disabled="false"]'),
              ].map((e) => ({
                id: e.getAttribute('data-size'),
                us: e.querySelector('[data-content="size-value"]')?.textContent.trim(),
              })),
            };
          });
          const p = pumaClothing(snapshot, candidate);
          if (p) await record([p]);
        } catch (e) {
          if (/403|401|429|CHALLENGE|ROBOTS/.test(e.message)) throw e;
          report.errors.push({ sku: candidate.sku, error: 'DETAIL_UNAVAILABLE' });
        }
        checked++;
        if (checked % 10 === 0)
          console.log(JSON.stringify({ source: key, checked, products: products.size }));
      }
      report.complete = listingComplete && checked === candidates.size && !report.errors.length;
    }
    report.status = report.complete
      ? 'complete'
      : report.products.length
        ? 'partial'
        : 'no_valid_products';
  }
} catch (e) {
  report.status = 'error';
  report.error = /^[A-Z0-9_]+$/.test(e.message) ? e.message : 'COLLECTION_FAILED';
  console.error(JSON.stringify({ source: key, error: report.error }));
} finally {
  report.finishedAt = new Date().toISOString();
  await save();
  await browser?.close();
}
console.log(
  JSON.stringify({
    source: key,
    status: report.status,
    complete: report.complete,
    count: report.products.length,
    error: report.error,
  }),
);
if (report.status === 'error' || (!report.products.length && !report.complete))
  process.exitCode = 1;
