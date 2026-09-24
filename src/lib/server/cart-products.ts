import { db, databaseConfigured, databaseProvider } from './db';
import { seaStore } from './seatable-store';
import { offerVisible } from '../promotion';
import type { Product } from '../types';
export async function cartProducts(ids: string[]): Promise<Product[]> {
  if (!databaseConfigured()) throw new Error('CATALOG_NOT_CONFIGURED');
  if (databaseProvider() === 'seatable')
    return (await seaStore.liveProducts()).filter((p) => ids.includes(p.id));
  const { data, error } = await db()
    .from('offers')
    .select('payload,updated_at,sources!inner(paused)')
    .in('id', ids)
    .eq('active', true)
    .eq('sources.paused', false);
  if (error) throw error;
  return data
    .filter((p) => offerVisible({ ...p.payload, updatedAt: p.updated_at }))
    .map((p) => p.payload as Product);
}
