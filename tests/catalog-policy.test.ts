import { expect, it } from 'vitest';
import { catalogBrands, isCatalogBrand } from '../src/lib/catalog-policy';
import { getAdapters } from '../src/lib/server/sources';
it('only Puma and Reebok are available for publication and scheduled refresh', () => {
  expect(catalogBrands).toEqual(['Puma', 'Reebok']);
  expect(
    getAdapters()
      .map((s) => s.id)
      .sort(),
  ).toEqual(['puma-us', 'reebok-us']);
  expect(isCatalogBrand('PUMA')).toBe(true);
  for (const name of ['Fila', 'On', 'Brooks', 'Nike', 'Adidas', 'Puma fake'])
    expect(isCatalogBrand(name)).toBe(false);
});
