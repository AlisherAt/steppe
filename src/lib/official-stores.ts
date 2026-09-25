export const officialStores = {
  'adidas-us': { brand: 'Adidas', origin: 'https://www.adidas.com' },
  'puma-us': { brand: 'Puma', origin: 'https://us.puma.com' },
  'reebok-us': { brand: 'Reebok', origin: 'https://www.reebok.com' },
  'on-us': { brand: 'On', origin: 'https://www.on.com' },
  'brooks-us': { brand: 'Brooks', origin: 'https://www.brooksrunning.com' },
  'skechers-us': { brand: 'Skechers', origin: 'https://www.skechers.com' },
  'fila-eu': { brand: 'Fila', origin: 'https://www.fila.de' },
} as const;
export function officialMarketUrl(value: string, market?: string) {
  try {
    const u = new URL(value);
    return (
      !u.username &&
      !u.password &&
      Object.entries(officialStores).some(
        ([id, s]) => s.origin === u.origin && id.endsWith(`-${market?.toLowerCase()}`),
      )
    );
  } catch {
    return false;
  }
}
export function retailStoreId(source: 'adidas' | 'reebok' | 'on' | 'brooks' | 'skechers' | 'fila') {
  return source === 'fila' ? ('fila-eu' as const) : (`${source}-us` as const);
}
export function sizeLabel(size: string) {
  return /^US\b|^EU\b/.test(size) ? size : `EU ${size}`;
}
