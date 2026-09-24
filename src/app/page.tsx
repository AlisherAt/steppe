import { Catalog } from '@/components/catalog';
import { getCatalog } from '@/lib/server/repository';
import { databaseConfigured } from '@/lib/server/db';
import { defaultFilters, type CatalogResult } from '@/lib/types';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const mode = databaseConfigured() ? 'live' : 'demo';
  const initial: CatalogResult = await getCatalog(defaultFilters, mode).catch(() => ({
    products: [],
    total: 0,
    facets: { brands: [], sizes: [], sources: [], categories: [] },
    mode,
    page: 1,
    pages: 0,
    error: 'Не удалось получить предложения. Повторите попытку.',
  }));
  return <Catalog initial={initial} initialMode={mode} />;
}
