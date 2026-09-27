import { Catalog } from '@/components/catalog';
import { getCatalog } from '@/lib/server/repository';
import { defaultFilters, type CatalogResult } from '@/lib/types';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Одежда со скидками — STEPPE',
  description:
    'Спортивная одежда Nike, Puma, Reebok и повседневная одежда Uniqlo. Цены в тенге, заказ через WhatsApp.',
};
export default async function Clothing({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const department = params.department === 'casual' ? 'casual' : 'sportswear';
  const initial: CatalogResult = await getCatalog({ ...defaultFilters, department }, 'live').catch(
    () => ({
      products: [],
      total: 0,
      facets: { brands: [], sizes: [], sources: [], categories: [] },
      mode: 'live',
      page: 1,
      pages: 0,
      error: 'Не удалось получить одежду. Повторите попытку.',
    }),
  );
  return <Catalog key={department} initial={initial} initialMode="live" department={department} />;
}
