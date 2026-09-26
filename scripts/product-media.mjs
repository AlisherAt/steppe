// Только фотографии и характеристики выбранного артикула/цвета из данных магазина.
export function mediaUrls(values, hosts) {
  return [
    ...new Set(
      values.filter((v) => {
        try {
          const u = new URL(v);
          return (
            u.protocol === 'https:' && !u.username && !u.password && hosts.includes(u.hostname)
          );
        } catch {
          return false;
        }
      }),
    ),
  ].slice(0, 10);
}
export function nikeMedia(p) {
  return {
    image_urls: mediaUrls(
      (p.contentImages || [])
        .filter((i) => i.cardType === 'image')
        .map((i) => i.properties?.squarish?.url || i.properties?.portrait?.url),
      ['static.nike.com'],
    ),
    color: String(p.colorDescription || '').slice(0, 300),
    usage: [
      p.productInfo?.subtitle,
      ...(p.sportTags || []).filter((v) => typeof v === 'string'),
      ...Object.values(p.taxonomyLabels || {})
        .flat()
        .filter((v) => typeof v === 'string'),
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 500),
  };
}
export function reebokMedia(p) {
  const option = p.options?.find((o) => /colou?r/i.test(o.name));
  return {
    image_urls: mediaUrls(
      (p.images || []).map((i) => i.src),
      ['www.reebok.com', 'cdn.shopify.com'],
    ),
    color: (option?.values || []).join(' / ').slice(0, 300),
    usage: (p.tags || [])
      .filter((t) => /running|training|lifestyle|walking|basketball|classic/i.test(t))
      .join(' ')
      .slice(0, 500),
  };
}
export function pumaMedia(state, sku) {
  const products = Object.values(state?.props?.urqlState || {}).flatMap((entry) => {
    try {
      const d = typeof entry.data === 'string' ? JSON.parse(entry.data) : entry.data;
      return d?.product ? [d.product] : [];
    } catch {
      return [];
    }
  });
  const variants = products.flatMap((p) => p.variations || []).filter((v) => v.id === sku);
  return {
    image_urls: mediaUrls(
      variants.flatMap((v) => (v.images || []).map((i) => i.href)),
      ['images.puma.com'],
    ),
    color: String(variants.find((v) => v.colorName)?.colorName || '').slice(0, 300),
    usage: String(products.find((p) => p.id === sku.split('_')[0])?.primaryCategoryId || '').slice(
      0,
      500,
    ),
  };
}
