import { z } from 'zod';
import {
  defaultFilters,
  type Filters,
  type Product,
  type CatalogResult,
  type Facets,
} from './types';
const list = z
  .string()
  .max(500)
  .transform((s) =>
    s
      ? s
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
          .slice(0, 30)
      : [],
  )
  .default([]);
export const filtersSchema = z
  .object({
    q: z.string().trim().max(100).default(''),
    brands: list,
    sizes: list,
    sources: list,
    gender: z.enum(['', 'men', 'women', 'unisex', 'kids']).default(''),
    category: z.string().max(80).default(''),
    minPrice: z.coerce.number().int().min(0).max(1000000).default(0),
    maxPrice: z.coerce.number().int().min(0).max(1000000).default(1000000),
    minDiscount: z.coerce.number().int().min(0).max(100).default(0),
    sort: z.enum(['newest', 'discount', 'price_asc', 'price_desc']).default('newest'),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .refine((v) => v.minPrice <= v.maxPrice, { message: 'Минимальная цена больше максимальной' });
export const PAGE_SIZE = 12;
export function facetsFor(products: Product[]): Facets {
  return {
    brands: [...new Set(products.map((p) => p.brand))].sort(),
    sizes: [...new Set(products.flatMap((p) => p.sizes))].sort(
      (a, b) => parseFloat(a) - parseFloat(b),
    ),
    sources: [
      ...new Map(
        products.map((p) => [p.sourceId, { id: p.sourceId, name: p.sourceName }]),
      ).values(),
    ],
    categories: [...new Set(products.map((p) => p.category))].sort(),
  };
}
export function filterCatalog(
  products: Product[],
  filters: Filters = defaultFilters,
  mode: 'live' | 'demo' = 'demo',
): CatalogResult {
  const f = filters;
  const matches = products.filter(
    (p) =>
      (!f.q ||
        `${p.brand} ${p.name} ${p.sku || ''}`
          .toLocaleLowerCase('ru')
          .includes(f.q.toLocaleLowerCase('ru'))) &&
      (!f.brands.length || f.brands.includes(p.brand)) &&
      (!f.sizes.length || p.sizes.some((s) => f.sizes.includes(s))) &&
      (!f.sources.length || f.sources.includes(p.sourceId)) &&
      (!f.gender || p.gender === f.gender) &&
      (!f.category || p.category === f.category) &&
      p.saleKzt >= f.minPrice &&
      p.saleKzt <= f.maxPrice &&
      p.discount >= f.minDiscount,
  );
  matches.sort(
    (a, b) =>
      (f.sort === 'discount'
        ? b.discount - a.discount
        : f.sort === 'price_asc'
          ? a.saleKzt - b.saleKzt
          : f.sort === 'price_desc'
            ? b.saleKzt - a.saleKzt
            : Date.parse(b.firstSeenAt) - Date.parse(a.firstSeenAt)) || a.id.localeCompare(b.id),
  );
  return {
    products: matches.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE),
    total: matches.length,
    facets: facetsFor(products),
    mode,
    page: f.page,
    pages: Math.ceil(matches.length / PAGE_SIZE),
  };
}
export function filterParams(f: Filters, mode: string): URLSearchParams {
  return new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(f).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)]),
    ),
    mode,
  });
}
