import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BrandDirectory } from '@/components/brand-directory';
import { getCatalog } from '@/lib/server/repository';
import { defaultFilters } from '@/lib/types';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Бренды кроссовок и одежды — STEPPE' };
export default async function BrandsPage() {
  const results = await Promise.all(
    (['sneakers', 'sportswear', 'casual'] as const).map((department) =>
      getCatalog({ ...defaultFilters, department }, 'live').catch(() => null),
    ),
  );
  const available = [...new Set(results.flatMap((r) => r?.facets.brands || []))];
  return (
    <main id="main-content" className="page-content">
      <Link className="text-link" href="/">
        <ArrowLeft size={16} />В каталог
      </Link>
      <div className="page-heading">
        <span className="eyebrow" style={{ marginTop: 30 }}>
          NIKE · PUMA · REEBOK · UNIQLO
        </span>
        <h1>
          Больше брендов.
          <br />
          Больше твоего.
        </h1>
        <p>
          Кроссовки и спортивная одежда Nike, Puma, Reebok. Повседневная одежда Uniqlo из Японии и
          Кореи. Подтверждённые скидки и доступные размеры в одном каталоге.
        </p>
        <p className="small muted">
          Это справочник для поиска, а не список официальных партнёров. Предложения появляются
          только после получения реальных данных магазина.
        </p>
      </div>
      <BrandDirectory available={available} error={results.some((r) => !r)} />
    </main>
  );
}
