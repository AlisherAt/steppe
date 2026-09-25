import { orderableProduct } from '../orderable';
import { isCatalogBrand } from '../catalog-policy';
import { db, databaseConfigured, databaseProvider } from './db';
import { seaStore } from './seatable-store';
import { manualProducts } from './manual-products';
import { withSellingPrices } from '../selling-price';
import { offerVisible } from '../promotion';
import type { Product } from '../types';
export async function cartProducts(ids: string[]): Promise<Product[]> {
  if (!databaseConfigured()) throw new Error('CATALOG_NOT_CONFIGURED');
  if (databaseProvider() === 'seatable')
    return (await manualProducts.combine(await seaStore.liveProducts())).products
      .filter(
        (p) =>
          isCatalogBrand(p.brand) && ids.includes(p.id) && orderableProduct(p) && offerVisible(p),
      )
      .map(withSellingPrices);
  const { data, error } = await db()
    .from('offers')
    .select('payload,updated_at,sources!inner(paused)')
    .in('id', ids)
    .eq('active', true)
    .eq('sources.paused', false);
  if (error) throw error;
  return data
    .filter((p) => offerVisible({ ...p.payload, updatedAt: p.updated_at }))
    .map((p) => p.payload as Product)
    .filter(orderableProduct)
    .filter((p) => isCatalogBrand(p.brand))
    .map(withSellingPrices);
}
