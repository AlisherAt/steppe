/** Ассортимент STEPPE. Ограничение действует также для старых корзин и импортов. */
export const catalogBrands = ['Puma', 'Reebok', 'Nike'];
export const catalogSourceIds = ['puma-us', 'reebok-us', 'nike-us'];
export const isCatalogBrand = (brand: string) =>
  catalogBrands.some((allowed) => allowed.toLowerCase() === brand.trim().toLowerCase());
