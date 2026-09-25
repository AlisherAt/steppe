export const manualSources = [
  { host: 'us.puma.com', prefix: '/us/', brand: 'Puma', market: 'US' },
  { host: 'www.reebok.com', prefix: '/products/', brand: 'Reebok', market: 'US' },
  { host: 'www.fila.de', prefix: '/', brand: 'Fila', market: 'EU' },
  { host: 'www.on.com', prefix: '/en-us/', brand: 'On', market: 'US' },
  { host: 'www.brooksrunning.com', prefix: '/en_us/', brand: 'Brooks', market: 'US' },
  { host: 'www.adidas.com', prefix: '/us/', brand: 'Adidas', market: 'US' },
  { host: 'www.nike.com', prefix: '/t/', brand: 'Nike', market: 'US' },
  { host: 'www.newbalance.com', prefix: '/', brand: 'New Balance', market: 'US' },
  { host: 'www.asics.com', prefix: '/us/', brand: 'ASICS', market: 'US' },
  { host: 'www.converse.com', prefix: '/', brand: 'Converse', market: 'US' },
  { host: 'www.vans.com', prefix: '/en-us/', brand: 'Vans', market: 'US' },
  { host: 'www.underarmour.com', prefix: '/en-us/', brand: 'Under Armour', market: 'US' },
  { host: 'www.skechers.com', prefix: '/', brand: 'Skechers', market: 'US' },
  { host: 'www.salomon.com', prefix: '/en-us/', brand: 'Salomon', market: 'US' },
  { host: 'www.hoka.com', prefix: '/en/us/', brand: 'HOKA', market: 'US' },
] as const;

export function manualSource(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
    throw Error('UNSUPPORTED_PRODUCT_URL');
  const source = manualSources.find(
    (s) => s.host === url.hostname && url.pathname.startsWith(s.prefix),
  );
  if (!source) throw Error('UNSUPPORTED_PRODUCT_URL');
  return source;
}

export function canonicalProductUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_|gclid$|fbclid$|msclkid$)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString();
}

export const productImageHosts = [
  'images.unsplash.com',
  'i.ebayimg.com',
  'images.stockx.com',
  'images.puma.com',
  'assets.adidas.com',
  'www.reebok.com',
  'cdn.shopify.com',
  'images.ctfassets.net',
  'www.brooksrunning.com',
  'www.skechers.com',
  'images.skechers.com',
  'www.fila.de',
  'static.nike.com',
  'nb.scene7.com',
  'images.asics.com',
  'www.converse.com',
  'images.vans.com',
  'underarmour.scene7.com',
  'cdn.sanity.io',
  'www.hoka.com',
];
