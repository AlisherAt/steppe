import { NextResponse } from 'next/server';
import { githubCatalogEnabled, githubProducts } from '@/lib/server/github-catalog';
import { getCatalog } from '@/lib/server/repository';
import { buildOutfits } from '@/lib/outfits';
import { defaultFilters } from '@/lib/types';
import { publicProduct } from '@/lib/public-product';
export async function GET() {
  try {
    const products = githubCatalogEnabled()
      ? githubProducts()
      : (
          await Promise.all(
            (['sneakers', 'sportswear', 'casual'] as const).flatMap((department) =>
              [1, 2].map((page) =>
                getCatalog({ ...defaultFilters, department, page, sort: 'price_asc' }, 'live'),
              ),
            ),
          )
        ).flatMap((result) => result.products);
    return NextResponse.json(
      {
        outfits: buildOutfits(products).map((outfit) => ({
          ...outfit,
          products: outfit.products.map(publicProduct),
        })),
      },
      { headers: { 'Cache-Control': 'public, max-age=60' } },
    );
  } catch {
    return NextResponse.json(
      { error: 'Не удалось собрать образы. Попробуй позже.' },
      { status: 503 },
    );
  }
}
