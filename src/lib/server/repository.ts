import 'server-only';
import { db, databaseConfigured, databaseProvider } from './db';
import { seaStore } from './seatable-store';
import { unstable_cache } from 'next/cache';
import { createHash } from 'node:crypto';
import { getAdapters } from './sources';
import { demoProducts } from '../demo';
import { filterCatalog, PAGE_SIZE } from '../catalog';
import type { CatalogResult, Filters, SourceStatus } from '../types';
const seaCacheKey = createHash('sha256')
  .update(
    `${process.env.SEATABLE_SERVER_URL}|${process.env.SEATABLE_API_TOKEN}|${process.env.SEATABLE_BASE_NAME}|${process.env.SEATABLE_WORKSPACE_ID}`,
  )
  .digest('hex');
const cachedSeaProducts = unstable_cache(
  () => seaStore.liveProducts(),
  ['seatable-live-v1', seaCacheKey],
  { revalidate: 60 },
);
const cachedSeaStatuses = unstable_cache(
  () => seaStore.sourceStatuses(),
  ['seatable-sources-v1', seaCacheKey],
  { revalidate: 60 },
);
export async function getCatalog(filters: Filters, mode: 'live' | 'demo'): Promise<CatalogResult> {
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
    const maxAge =
      Math.min(168, Math.max(1, Number(process.env.OFFER_MAX_AGE_HOURS || 36))) * 3600000;
    return filterCatalog(
      (await cachedSeaProducts()).filter((p) => Date.now() - Date.parse(p.updatedAt) <= maxAge),
      filters,
      'live',
    );
  }
  const { data, error } = await db().rpc('search_catalog', {
    filters,
    page_size: PAGE_SIZE,
    max_age_hours: Number(process.env.OFFER_MAX_AGE_HOURS || 36),
  });
  if (error) throw new Error('CATALOG_UNAVAILABLE');
  return { ...data, mode, page: filters.page, pages: Math.ceil(data.total / PAGE_SIZE) };
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
          .select('id,name,paused,last_success_at,last_attempt_at,last_error,offer_count');
  if (error) throw new Error('SOURCE_STATUS_UNAVAILABLE');
  return defaults.map((s) => {
    const row = data.find((d) => d.id === s.id);
    const adapter = adapters.find((a) => a.id === s.id)!;
    if (!row) return s;
    const overdue =
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
      offerCount: row.offer_count,
      message: row.paused
        ? 'Обновление источника приостановлено.'
        : !adapter.configured()
          ? s.message
          : overdue
            ? 'Данные устарели. Проверьте расписание и доступ к источнику; старые предложения скрыты.'
            : row.last_error
              ? 'Последняя проверка не удалась. Повторим по расписанию.'
              : row.last_success_at
                ? 'Данные получены из подключённого источника.'
                : 'Фид настроен. Ожидается первая успешная проверка.',
    };
  });
}
