import 'server-only';
import { orderableProduct } from '../orderable';
import { publicProduct } from '../public-product';
import { db, databaseConfigured, databaseProvider } from './db';
import { seaStore } from './seatable-store';
import { manualProducts } from './manual-products';
import { withSellingPrices } from '../selling-price';
import { unstable_cache } from 'next/cache';
import { createHash } from 'node:crypto';
import { getAdapters } from './sources';
import { offerVisible } from '../promotion';
import { demoProducts } from '../demo';
import { filterCatalog } from '../catalog';
import type { CatalogResult, Filters, SourceStatus } from '../types';
const seaCacheKey = createHash('sha256')
  .update(
    `${process.env.SEATABLE_SERVER_URL}|${process.env.SEATABLE_API_TOKEN}|${process.env.SEATABLE_BASE_NAME}|${process.env.SEATABLE_WORKSPACE_ID}`,
  )
  .digest('hex');
const cachedSeaProducts = unstable_cache(
  () => seaStore.liveProducts(),
  ['seatable-live-v4', seaCacheKey],
  { revalidate: 60, tags: ['steppe:catalog'] },
);
const cachedSeaStatuses = unstable_cache(
  () => seaStore.sourceStatuses(),
  ['seatable-sources-v2', seaCacheKey],
  { revalidate: 60, tags: ['steppe:sources'] },
);
export async function internalCatalog(
  filters: Filters,
  mode: 'live' | 'demo',
): Promise<CatalogResult> {
  if (mode === 'demo') return filterCatalog(demoProducts, filters, 'demo');
  if (!databaseConfigured())
    return {
      products: [],
      total: 0,
      facets: { brands: [], sizes: [], sources: [], categories: [] },
      mode,
      page: filters.page,
      pages: 0,
    };
  if (databaseProvider() === 'seatable') {
    return filterCatalog(
      (await manualProducts.combine(await cachedSeaProducts())).products
        .filter((p) => offerVisible(p) && orderableProduct(p))
        .map(withSellingPrices),
      filters,
      'live',
    );
  }
  const products = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const { data, error } = await db()
      .from('offers')
      .select('payload,updated_at,sources!inner(paused)')
      .eq('active', true)
      .eq('sources.paused', false)
      .order('id')
      .range(offset, offset + 499);
    if (error) throw new Error('CATALOG_UNAVAILABLE');
    products.push(
      ...data
        .map((row) => ({ ...row.payload, updatedAt: row.updated_at }))
        .filter((p) => orderableProduct(p) && offerVisible(p))
        .map(withSellingPrices),
    );
    if (data.length < 500) return filterCatalog(products, filters, 'live');
  }
  throw new Error('CATALOG_ROW_LIMIT');
}
export async function getCatalog(filters: Filters, mode: 'live' | 'demo'): Promise<CatalogResult> {
  const result = await internalCatalog(filters, mode);
  return { ...result, products: result.products.map(publicProduct) };
}
export async function getSources(): Promise<SourceStatus[]> {
  const adapters = getAdapters();
  const defaults: SourceStatus[] = adapters.map((a) => ({
    id: a.id,
    name: a.name,
    status: 'needs_configuration',
    lastSuccess: null,
    lastAttempt: null,
    message: a.configurationMessage,
    offerCount: 0,
  }));
  if (!databaseConfigured()) return defaults;
  const { data, error } =
    databaseProvider() === 'seatable'
      ? { data: await cachedSeaStatuses(), error: null }
      : await db()
          .from('sources')
          .select(
            'id,name,paused,last_success_at,last_attempt_at,last_error,offer_count,next_refresh_at',
          );
  if (error) throw new Error('SOURCE_STATUS_UNAVAILABLE');
  return defaults.map((s) => {
    const row = data.find((d) => d.id === s.id);
    const adapter = adapters.find((a) => a.id === s.id)!;
    if (!row) return s;
    const nextRefreshAt =
      row.next_refresh_at && Date.parse(row.next_refresh_at) > Date.now()
        ? row.next_refresh_at
        : null;
    const overdue =
      !nextRefreshAt &&
      row.last_success_at &&
      Date.now() - Date.parse(row.last_success_at) >
        Number(process.env.OFFER_MAX_AGE_HOURS || 36) * 3600000;
    return {
      ...s,
      status: row.paused
        ? 'paused'
        : !adapter.configured()
          ? 'needs_configuration'
          : row.last_error || overdue
            ? 'error'
            : row.last_success_at
              ? 'ready'
              : 'needs_configuration',
      lastSuccess: row.last_success_at,
      lastAttempt: row.last_attempt_at,
      nextRefreshAt,
      offerCount: row.offer_count,
      message: row.paused
        ? 'Обновление источника приостановлено.'
        : !adapter.configured()
          ? s.message
          : overdue
            ? 'Данные устарели. Проверьте расписание и доступ к источнику; старые предложения скрыты.'
            : row.last_error
              ? 'Последняя проверка не удалась. Повторим по расписанию.'
              : nextRefreshAt
                ? 'Запросы отложены до ' +
                  new Date(nextRefreshAt).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' }) +
                  ' (Казахстан): срок акции указан источником. Цена и наличие в период паузы не перепроверяются.'
                : row.last_success_at
                  ? 'Данные получены из подключённого источника.'
                  : 'Фид настроен. Ожидается первая успешная проверка.',
    };
  });
}
