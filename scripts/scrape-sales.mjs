import { extract } from './scraper-extract.mjs';
import { chromium } from '@playwright/test';
import robotsParser from 'robots-parser';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID, randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { sources, selectors } from './scraper-sources.mjs';
import { collectPumaDetails } from './puma-details.mjs';
import { collectAdidasDetails } from './adidas-details.mjs';
import { extractPython } from './python-parsers.mjs';
import { loadScraperProxy, fetchRobots, safeScraperError } from './scraper-proxy.mjs';
import {
  discoverRetail,
  collectReebok,
  collectOn,
  collectBrooks,
  collectFila,
} from './retail-details.mjs';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function runScraper() {
  const proxy = await loadScraperProxy();
  const errorText = (error) => safeScraperError(error, proxy);
  const selectedIds = (process.env.SCRAPER_SOURCE_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (selectedIds.some((id) => !sources.some((s) => s.id === id)))
    throw Error('INVALID_SCRAPER_SOURCE_IDS');
  const selectedSources = selectedIds.length
    ? sources.filter((s) => selectedIds.includes(s.id))
    : sources;
  let permissions;
  try {
    permissions = JSON.parse(process.env.SCRAPER_PERMISSIONS_JSON || '{}');
  } catch {
    throw Error('INVALID_SCRAPER_PERMISSIONS');
  }
  if (!permissions || Array.isArray(permissions) || typeof permissions !== 'object')
    throw Error('INVALID_SCRAPER_PERMISSIONS');
  const report = {
    runId: process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || 1}`
      : randomUUID(),
    checkedAt: new Date().toISOString(),
    reports: [],
    products: [],
    published: 0,
  };
  const save = async () => {
    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/scraper.tmp.json', JSON.stringify(report, null, 2));
    await rename('artifacts/scraper.tmp.json', 'artifacts/scraper.json');
  };
  let browser;
  const maxSteps = Number(process.env.SCRAPER_MAX_STEPS || 20);
  const detailLimit = Number(process.env.PUMA_DETAIL_LIMIT || 12);
  const adidasLimit = Number(process.env.ADIDAS_DETAIL_LIMIT || 6);
  if (!Number.isInteger(adidasLimit) || adidasLimit < 1 || adidasLimit > 20)
    throw Error('INVALID_ADIDAS_DETAIL_LIMIT');
  if (!Number.isInteger(detailLimit) || detailLimit < 1 || detailLimit > 30)
    throw Error('INVALID_PUMA_DETAIL_LIMIT');
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 60)
    throw Error('INVALID_SCRAPER_LIMIT');
  const deadline = Date.now() + 15 * 60_000;
  try {
    for (const source of selectedSources) {
      const entry = {
        source: source.id,
        brand: source.brand,
        status: 'needs_permission',
        count: 0,
      };
      report.reports.push(entry);
      console.log(JSON.stringify({ source: source.id, event: 'starting' }));
      // Значение — ссылка/номер согласования с владельцем, не автоматическое разрешение.
      if (Date.now() > deadline) {
        entry.status = 'time_limit';
        await save();
        continue;
      }
      let context, page;
      const sourceDeadline = Math.min(
        deadline,
        Date.now() + (source.id === 'puma' ? 300000 : 180000),
      );
      try {
        const origin = new URL(source.url).origin;
        const robotsURL = origin + '/robots.txt';
        const response = await fetchRobots(robotsURL, proxy);
        if ((response.status < 200 || response.status >= 300) && response.status !== 404)
          throw Error(`ROBOTS_HTTP_${response.status}`);
        const body = response.body;
        if (body.length > 1_000_000 || /^\s*</.test(body)) throw Error('INVALID_ROBOTS');
        const robots = robotsParser(robotsURL, body);
        const allowed = (url) =>
          new URL(url).origin === origin && robots.isAllowed(url, 'SteppeSaleCollector') !== false;
        if (!allowed(source.url)) throw Error('ROBOTS_DISALLOWED');
        if (typeof permissions[source.id] !== 'string' || !permissions[source.id].trim()) {
          entry.status = 'needs_permission';
          continue;
        }
        const crawlDelay = Number(robots.getCrawlDelay('SteppeSaleCollector') || 0) * 1000;
        if (crawlDelay > 60000) throw Error('CRAWL_DELAY_TOO_LONG');
        browser ||= await chromium.launch({ headless: true });
        // Не маскируем автоматизацию и не используем stealth/CAPTCHA-сервисы.
        context = await browser.newContext({
          ...(proxy ? { proxy } : {}),
          locale: 'en-US',
          viewport: { width: 1440, height: 1000 },
          serviceWorkers: 'block',
        });
        let blocked = '';
        await context.route('**/*', async (route) => {
          const req = route.request();
          if (
            source.id === 'adidas' &&
            ['xhr', 'fetch'].includes(req.resourceType()) &&
            new URL(req.url()).origin === origin &&
            !allowed(req.url())
          ) {
            blocked = 'ADIDAS_REQUEST_ROBOTS_DISALLOWED';
            await route.abort();
            return;
          }
          if (
            req.isNavigationRequest() &&
            req.resourceType() === 'document' &&
            !allowed(req.url())
          ) {
            // Внешний iframe аналитики не является переходом каталога.
            if (!req.frame().parentFrame()) blocked = 'NAVIGATION_DISALLOWED';
            await route.abort();
            return;
          }
          await route.continue();
        });
        context.on('response', (r) => {
          if (
            new URL(r.url()).origin === origin &&
            (r.status() === 429 ||
              (r.request().resourceType() === 'document' &&
                !r.request().frame().parentFrame() &&
                [401, 403].includes(r.status())))
          )
            blocked = `ACCESS_HTTP_${r.status()}`;
        });
        page = await context.newPage();
        page.setDefaultTimeout(8000);
        page.setDefaultNavigationTimeout(30000);
        const first = await page.goto(source.url, { waitUntil: 'domcontentloaded' });
        if (!first?.ok()) throw Error(`PAGE_HTTP_${first?.status() || 0}`);
        if (['reebok', 'on', 'brooks', 'skechers', 'fila'].includes(source.id)) {
          await pause(Math.max(crawlDelay, 3500));
          const links = await discoverRetail(page, source);
          if (!links.length) throw Error('NO_PRODUCT_LINKS');
          const checkAccess = async () => {
            if (blocked) throw Error(blocked);
            if (
              /access denied|verify (?:that )?you are human|unusual traffic|robot check|just a moment|verifying your browser|checking your browser/i.test(
                (await page.locator('body').innerText()).slice(0, 16000),
              )
            )
              throw Error('ACCESS_CHALLENGE');
          };
          if (source.id === 'skechers') {
            const candidates = await extractPython(page, source);
            report.products.push(...candidates.filter((p) => p.sku));
            entry.count = candidates.filter((p) => p.sku).length;
            throw Error('SIZE_REQUEST_ROBOTS_DISALLOWED');
          }
          const collector = {
            reebok: collectReebok,
            on: collectOn,
            brooks: collectBrooks,
            fila: collectFila,
          }[source.id];
          const collected = new Map();
          for (const url of links.slice(0, 6)) {
            if (Date.now() + 15000 > sourceDeadline || blocked) break;
            if (!allowed(url)) continue;
            try {
              await pause(Math.max(crawlDelay, 2500));
              const r = await page.goto(url, { waitUntil: 'domcontentloaded' });
              if (!r?.ok()) throw Error(`PAGE_HTTP_${r?.status() || 0}`);
              await pause(2500);
              await checkAccess();
              const p = await collector(page, source, {
                delay: Math.max(crawlDelay, 2000),
                checkAccess,
                allowed,
                deadline: sourceDeadline,
              });
              collected.set(p.sku, p);
              console.log(
                JSON.stringify({ source: source.id, sku: p.sku, verifiedSizes: p.variants.length }),
              );
            } catch (error) {
              entry.error = errorText(error);
              console.log(JSON.stringify({ source: source.id, detailError: entry.error }));
              await mkdir('artifacts/diagnostics', { recursive: true });
              await page
                .screenshot({ path: `artifacts/diagnostics/${source.id}-detail.png` })
                .catch(() => {});
            }
          }
          report.products.push(...collected.values());
          entry.count = collected.size;
          entry.status = entry.count ? 'partial' : 'error';
          if (!entry.count) entry.error ||= 'NO_VERIFIED_VARIANTS';
          continue;
        }
        const found = new Map(),
          visited = new Set([source.url]);
        let idle = 0;
        entry.status = 'partial';
        for (let step = 0; step < maxSteps && Date.now() < sourceDeadline; step++) {
          await pause(Math.max(crawlDelay, randomInt(2500, 5001)));
          if (blocked) throw Error(blocked);
          const bodyText = (await page.locator('body').innerText()).slice(0, 12000);
          if (
            /access denied|verify (?:that )?you are human|unusual traffic|robot check|just a moment|verifying your browser|checking your browser/i.test(
              bodyText,
            ) ||
            (await page.locator('iframe[src*="captcha"]:visible, [id*="captcha"]:visible').count())
          )
            throw Error('ACCESS_CHALLENGE');
          const previous = found.size;
          for (const p of [
            ...(await extractPython(page, source)),
            ...(await extract(page, source)),
          ])
            found.set(`${p.sku}:${p.product_url}`, p);
          // Проверка размеров полезнее накопления сотни необработанных кандидатов.
          if (source.id === 'puma' && found.size >= detailLimit) break;
          if (source.id === 'adidas' && found.size >= adidasLimit) break;
          if (process.env.PYTHON_SALE_PARSERS === '1' && source.id !== 'puma' && found.size >= 6)
            break;
          idle = found.size === previous ? idle + 1 : 0;
          const more = page.locator(selectors.more).first();
          if ((await more.isVisible()) && (await more.isEnabled())) {
            await more.click();
            continue;
          }
          if (idle < 4) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            continue;
          }
          const href = await page
            .locator(selectors.next)
            .first()
            .getAttribute('href')
            .catch(() => null);
          if (href) {
            const next = new URL(href, page.url()).href;
            if (allowed(next) && !visited.has(next)) {
              visited.add(next);
              const r = await page.goto(next, { waitUntil: 'domcontentloaded' });
              if (!r?.ok()) throw Error('PAGINATION_FAILED');
              idle = 0;
              continue;
            }
          }
          entry.status = 'finished_observed_pages';
          break;
        }
        const products = [...found.values()].slice(0, 100);
        if (source.id === 'puma' || source.id === 'adidas') {
          const limit = source.id === 'adidas' ? adidasLimit : detailLimit;
          const checkAccess = async () => {
            if (blocked) throw Error(blocked);
            const text = (await page.locator('body').innerText()).slice(0, 16000);
            if (
              /access denied|verify (?:that )?you are human|unusual traffic|robot check|just a moment|verifying your browser|checking your browser/i.test(
                text,
              )
            )
              throw Error('ACCESS_CHALLENGE');
          };
          for (let index = 0; index < Math.min(limit, products.length); index++) {
            if (Date.now() + 60000 > sourceDeadline || blocked) break;
            try {
              const candidate = products[index];
              if (!allowed(candidate.product_url)) throw Error('ROBOTS_DISALLOWED');
              await pause(Math.max(crawlDelay, 2500));
              const response = await page.goto(candidate.product_url, {
                waitUntil: 'domcontentloaded',
              });
              if (!response?.ok()) throw Error(`PAGE_HTTP_${response?.status() || 0}`);
              const collector = source.id === 'adidas' ? collectAdidasDetails : collectPumaDetails;
              products[index] = await collector(page, candidate, {
                checkAccess,
                delay: Math.max(crawlDelay, 2500),
                deadline: sourceDeadline,
              });
              console.log(
                JSON.stringify({
                  source: source.id,
                  sku: candidate.sku,
                  verifiedSizes: products[index].variants.length,
                }),
              );
            } catch (error) {
              if (/HTTP_40[13]|HTTP_429|ACCESS_|DISALLOWED/.test(String(error.message)))
                blocked = errorText(error);
              console.log(
                JSON.stringify({
                  source: source.id,
                  sku: products[index].sku,
                  detailError: errorText(error),
                }),
              );
              await mkdir('artifacts/diagnostics', { recursive: true });
              await page
                .screenshot({ path: `artifacts/diagnostics/${source.id}-${index}.png` })
                .catch(() => {});
              if (blocked) break;
            }
          }
        }
        if (process.env.PYTHON_SALE_PARSERS === '1' && source.id !== 'puma') {
          for (const candidate of products.slice(0, 6)) {
            if (candidate.size_price_verified || Date.now() + 20000 > sourceDeadline || blocked)
              continue;
            try {
              if (!allowed(candidate.product_url)) continue;
              await pause(Math.max(crawlDelay, 2500));
              const response = await page.goto(candidate.product_url, {
                waitUntil: 'domcontentloaded',
              });
              if (!response?.ok()) throw Error(`PAGE_HTTP_${response?.status() || 0}`);
              await pause(Math.max(crawlDelay, 1500));
              if (
                blocked ||
                /access denied|verify (?:that )?you are human|unusual traffic|robot check|just a moment|verifying your browser|checking your browser/i.test(
                  (await page.locator('body').innerText()).slice(0, 16000),
                )
              )
                throw Error(blocked || 'ACCESS_CHALLENGE');
              const detail = await extractPython(page, source, candidate);
              if (detail.sku && candidate.sku && detail.sku !== candidate.sku)
                throw Error('DETAIL_SKU_MISMATCH');
              candidate.sku ||= detail.sku;
              candidate.size_candidates = detail.size_candidates;
            } catch (error) {
              entry.error = errorText(error);
              if (/HTTP_40[13]|HTTP_429|ACCESS_|DISALLOWED/.test(entry.error)) {
                blocked = entry.error;
                break;
              }
            }
          }
        }
        report.products.push(...products.filter((p) => p.sku));
        entry.count = products.filter((p) => p.sku).length;
        if (blocked) {
          entry.status = 'error';
          entry.error = blocked;
        }
        if (!entry.count && !blocked) entry.status = 'no_valid_products';
      } catch (error) {
        entry.status = 'error';
        entry.error = errorText(error);
        await mkdir('artifacts/diagnostics', { recursive: true });
        await page?.screenshot({ path: `artifacts/diagnostics/${source.id}.png` }).catch(() => {});
      } finally {
        await context?.close();
        await save();
        console.log(
          JSON.stringify({
            source: entry.source,
            status: entry.status,
            count: entry.count,
            error: entry.error,
          }),
        );
      }
    }
  } finally {
    await browser?.close();
    report.checkedAt = new Date().toISOString();
    await save();
  }
  console.log(
    JSON.stringify({
      sources: report.reports.length,
      collected: report.products.length,
      published: 0,
      statuses: report.reports.map((r) => ({ source: r.source, status: r.status, count: r.count })),
    }),
  );
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runScraper().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
