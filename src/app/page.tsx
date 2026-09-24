import { Catalog } from '@/components/catalog';
import { getCatalog } from '@/lib/server/repository';
import { databaseConfigured } from '@/lib/server/db';
import { defaultFilters, type CatalogResult } from '@/lib/types';
import { demoEnabled } from '@/lib/catalog-mode';
import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (!demoEnabled() && params.mode === 'demo') redirect('/?mode=live');
  const mode = databaseConfigured() || !demoEnabled() ? 'live' : 'demo';
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
