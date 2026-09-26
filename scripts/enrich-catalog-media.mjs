import { readFile, writeFile, mkdir } from 'node:fs/promises';
import robotsParser from 'robots-parser';
import { nikeMedia, reebokMedia, pumaMedia } from './product-media.mjs';

// Отдельное дополнение к снимкам: фотографии не изменяют цену и время проверки остатков.
const path = 'data/catalog/product-media.json';
const media = JSON.parse(await readFile(path, 'utf8').catch(() => '{}'));
const robots = new Map();
async function get(url) {
  const origin = new URL(url).origin;
  if (!robots.has(origin)) {
    const r = await fetch(origin + '/robots.txt', { signal: AbortSignal.timeout(20000) });
    if (![200, 404].includes(r.status)) throw Error(`ROBOTS_HTTP_${r.status}`);
    robots.set(
      origin,
      robotsParser(origin + '/robots.txt', r.status === 404 ? '' : await r.text()),
    );
  }
  const rules = robots.get(origin);
  if (rules.isAllowed(url, 'SteppeSaleCollector') === false) throw Error('ROBOTS_DISALLOWED');
  const delay = Math.max(1200, Number(rules.getCrawlDelay('SteppeSaleCollector') || 0) * 1000);
  if (delay > 60000) throw Error('CRAWL_DELAY_TOO_LONG');
  await new Promise((r) => setTimeout(r, delay));
  const r = await fetch(url, {
    headers: { 'User-Agent': 'SteppeSaleCollector/1.0' },
    redirect: 'error',
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw Error(`HTTP_${r.status}`);
  return r.text();
}
function save(p, details) {
  if (!details.image_urls?.length) return;
  media[p.id] = { imageUrls: details.image_urls, color: details.color, usage: details.usage };
}
for (const source of ['nike', 'reebok', 'puma']) {
  const snapshot = JSON.parse(await readFile(`data/catalog/${source}-us.json`, 'utf8'));
  if (source === 'nike') {
    for (const p of snapshot.products) {
      try {
        const raw = JSON.parse(await readFile(`artifacts/nike-live/${p.sku}.json`, 'utf8'));
        const selected = raw.nextData?.props?.pageProps?.selectedProduct;
        if (selected?.styleColor === p.sku) save(p, nikeMedia(selected));
      } catch {
        /* Нет локальной страницы: галерею добавит очередной сбор. */
      }
    }
  } else if (process.argv.includes('--online')) {
    try {
      if (source === 'reebok') {
        for (let page = 1; page <= 20; page++) {
          const data = JSON.parse(
            await get(
              `https://www.reebok.com/collections/sale/products.json?limit=250&page=${page}`,
            ),
          );
          for (const raw of data.products) {
            const p = snapshot.products.find(
              (p) => p.productUrl === `https://www.reebok.com/products/${raw.handle}`,
            );
            if (p) save(p, reebokMedia(raw));
          }
          if (data.products.length < 250) break;
        }
      } else {
        await mkdir('artifacts/product-media', { recursive: true });
        for (const [index, p] of snapshot.products.entries()) {
          const cache = `artifacts/product-media/puma-${p.sku}.json`;
          let state;
          try {
            state = JSON.parse(await readFile(cache, 'utf8'));
          } catch {
            const html = await get(p.productUrl);
            const json = /<script\b[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(
              html,
            )?.[1];
            if (!json) throw Error('PUMA_PAGE_DATA_UNAVAILABLE');
            state = JSON.parse(json);
            await writeFile(cache, JSON.stringify(state));
          }
          save(p, pumaMedia(state, p.sku));
          if (index % 20 === 0) console.log(JSON.stringify({ source, checked: index + 1 }));
        }
      }
    } catch (e) {
      console.log(JSON.stringify({ source, error: e.message }));
    }
  }
  await writeFile(path, JSON.stringify(media) + '\n');
  console.log(
    JSON.stringify({
      source,
      galleries: snapshot.products.filter((p) => media[p.id]?.imageUrls?.length > 1).length,
      total: snapshot.products.length,
    }),
  );
}
