import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BrandDirectory } from '@/components/brand-directory';
import { getCatalog } from '@/lib/server/repository';
import { defaultFilters } from '@/lib/types';
import { brandNames } from '@/lib/brands';
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
          ТВОЙ СТИЛЬ НЕ ОГРАНИЧЕН ДВУМЯ БРЕНДАМИ
        </span>
        <h1>
          Больше брендов.
          <br />
          Больше твоего.
        </h1>
        <p>
          В справочнике уже {brandNames.length} марок: от повседневных силуэтов до беговых и
          трейловых кроссовок. Новые бренды из разрешённых фидов добавляются автоматически.
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
