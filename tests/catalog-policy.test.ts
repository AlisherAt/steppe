import { expect, it } from 'vitest';
import { catalogBrands, isCatalogBrand } from '../src/lib/catalog-policy';
import { getAdapters } from '../src/lib/server/sources';
it('Puma, Reebok and Nike are available for publication and scheduled refresh', () => {
  expect(catalogBrands).toEqual(['Puma', 'Reebok', 'Nike', 'Uniqlo']);
  expect(
    getAdapters()
      .map((s) => s.id)
      .sort(),
  ).toEqual(['nike-us', 'puma-us', 'reebok-us']);
  expect(isCatalogBrand('PUMA')).toBe(true);
  expect(isCatalogBrand('Nike')).toBe(true);
  for (const name of ['Fila', 'On', 'Brooks', 'Adidas', 'Puma fake'])
    expect(isCatalogBrand(name)).toBe(false);
});
