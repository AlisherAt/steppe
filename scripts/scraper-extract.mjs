import { selectors } from './scraper-sources.mjs';
export function price(value) {
  const text = String(value ?? '')
    .replace(/USD|US\$|\$/g, '')
    .trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text.replaceAll(',', ''));
  return n > 0 && Number.isFinite(n) ? n : null;
}
// Извлекаем только явно обозначенные старую и новую цену. Диапазоны не принимаются.
export async function extract(page, source) {
  const raw = await page.evaluate(
    (s) =>
      [...document.querySelectorAll(s.cards)].map((card) => {
        const texts = (selector) =>
          [...card.querySelectorAll(selector)]
            .filter((e) => e.getClientRects().length)
            .map(
              (e) =>
                e.getAttribute('content') || e.getAttribute('data-value') || e.textContent.trim(),
            );
        const sku = card.querySelector(
          '[itemprop="sku"], [data-testid="product-sku"], .product-sku',
        );
        const img = card.querySelector('img');
        const href = card.querySelector('a[href]')?.href;
        // Nike публикует Style ID последним сегментом ссылки выбранного цвета.
        let nikeSku = '';
        if (s.sourceId === 'nike' && href) {
          const segment = new URL(href).pathname.split('/').filter(Boolean).pop();
          if (/^[A-Z0-9]{6}-\d{3}$/.test(segment || '')) nikeSku = segment;
        }
        return {
          sku:
            card.getAttribute('data-product-sku') ||
            card.getAttribute('data-style-color') ||
            sku?.getAttribute('content') ||
            sku?.textContent?.trim() ||
            nikeSku,
          name: card.querySelector(s.name)?.textContent?.trim(),
          image: img?.currentSrc || img?.src,
          url: href,
          text: card.textContent,
          old: texts(s.old),
          sale: texts(s.sale),
        };
      }),
    { ...selectors, sourceId: source.id },
  );
  const result = [];
  for (const row of raw) {
    const unique = (values) => {
      const parsed = [...new Set(values.map(price).filter((v) => v !== null))];
      return parsed.length === 1 ? parsed[0] : null;
    };
    const old = unique(row.old),
      sale = unique(row.sale);
    if (!row.sku || !row.name || old === null || sale === null || sale >= old) continue;
    if (
      !/\b(sneakers?|trainers?|shoes?|footwear)\b/i.test(row.text) ||
      /\b(slides?|sandals?|boots?|cleats?|socks?|shirts?|insoles?)\b/i.test(row.text)
    )
      continue;
    try {
      const url = new URL(row.url),
        image = new URL(row.image);
      if (
        url.origin !== new URL(source.url).origin ||
        image.protocol !== 'https:' ||
        url.username ||
        url.password ||
        image.username ||
        image.password
      )
        continue;
      result.push({
        source: source.id,
        brand: source.brand,
        sku: row.sku,
        name: row.name,
        image_url: image.href,
        product_url: url.href,
        old_price: old,
        sale_price: sale,
        currency: 'USD',
        checked_at: new Date().toISOString(),
        size_price_verified: false,
      });
    } catch {
      /* Неполная карточка пропускается. */
    }
  }
  return result;
}
