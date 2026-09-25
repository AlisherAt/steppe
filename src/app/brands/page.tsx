import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BrandDirectory } from '@/components/brand-directory';
import { getCatalog } from '@/lib/server/repository';
import { defaultFilters } from '@/lib/types';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Все бренды кроссовок — STEPPE' };
export default async function BrandsPage() {
  const result = await getCatalog(defaultFilters, 'live').catch(() => null);
  return (
    <main id="main-content" className="page-content">
      <Link className="text-link" href="/">
        <ArrowLeft size={16} />В каталог
      </Link>
      <div className="page-heading">
        <span className="eyebrow" style={{ marginTop: 30 }}>
          PUMA И REEBOK
        </span>
        <h1>
          Больше брендов.
          <br />
          Больше твоего.
        </h1>
        <p>
          Кроссовки Puma и Reebok: повседневные модели, бег и тренировки. Подтверждённые скидки и
          доступные размеры в одном каталоге.
        </p>
        <p className="small muted">
          Это справочник для поиска, а не список официальных партнёров. Предложения появляются
          только после получения реальных данных магазина.
        </p>
      </div>
      <BrandDirectory available={result?.facets.brands || []} error={!result} />
    </main>
  );
}
