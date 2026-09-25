/** Ассортимент STEPPE. Ограничение действует также для старых корзин и импортов. */
export const catalogBrands = ['Puma', 'Reebok'];
export const catalogSourceIds = ['puma-us', 'reebok-us'];
export const isCatalogBrand = (brand: string) =>
  catalogBrands.some((allowed) => allowed.toLowerCase() === brand.trim().toLowerCase());
