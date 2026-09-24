import 'server-only';
import { seaClient } from './seatable-client';
import { seaStore, latestRun, decodeSnapshot } from './seatable-store';
import { nextPromotionRefresh } from '../promotion';
import { getAdapters } from './sources';
import { toProduct } from './adapters';
import { loadRates, nativeRate } from './rates';
import { safeCode } from './http';
let running: Promise<Awaited<ReturnType<typeof performRefresh>>> | undefined;
export function refreshSeaTable() {
  if (running) return running;
  running = performRefresh().finally(() => {
    running = undefined;
  });
  return running;
}
async function performRefresh() {
  const deadline = Date.now() + 220000;
  await seaClient.ensureSchema();
  const adapters = getAdapters();
  const sources = await seaStore.ensureSources(adapters);
  await seaStore
    .prune()
    .catch((e) =>
      console.error(JSON.stringify({ event: 'seatable_cleanup_failed', code: safeCode(e) })),
    );
  const { runs, offers } = await seaStore.state();
  const scheduled = new Map(
    adapters.map((a) => {
      const run = latestRun(runs, a.id, true);
      return [a.id, run ? nextPromotionRefresh(decodeSnapshot(run, offers)) : null];
    }),
  );
  // A durable lease is not available in SeaTable. Immutable committed snapshots keep
  // overlapping executions safe; GitHub Actions concurrency prevents routine overlap.
  adapters.sort((a, b) =>
    (latestRun(runs, a.id)?.started_at || '').localeCompare(
      latestRun(runs, b.id)?.started_at || '',
    ),
  );
  const enabled = adapters.filter(
    (a) =>
      !scheduled.get(a.id) && a.configured() && sources.some((s) => s.id === a.id && !s.paused),
  );
  let rateError: string | null = null;
  const rates = enabled.length
    ? await loadRates().catch((e) => {
        rateError = safeCode(e);
        return [nativeRate()];
      })
    : [];
  const results: {
    source: string;
    status: string;
    count?: number;
    code?: string;
    nextRefreshAt?: string;
  }[] = [];
  // Sequential writes reduce SeaTable API usage and avoid exceeding per-base limits.
  for (const adapter of adapters) {
    if (sources.find((s) => s.id === adapter.id)?.paused) {
      results.push({ source: adapter.id, status: 'paused' });
      continue;
    }
    if (!adapter.configured()) {
      results.push({ source: adapter.id, status: 'needs_configuration' });
      continue;
    }
    const nextRefreshAt = scheduled.get(adapter.id);
    if (nextRefreshAt) {
      results.push({ source: adapter.id, status: 'deferred', nextRefreshAt });
      console.info(JSON.stringify({ event: 'seatable_refresh', ...results[results.length - 1] }));
      continue;
    }
    if (Date.now() > deadline) {
      results.push({ source: adapter.id, status: 'error', code: 'REFRESH_BUDGET_EXHAUSTED' });
      continue;
    }
    const run = await seaStore.start(adapter.id);
    try {
      const products = (await adapter.fetchProducts()).map((p) => toProduct(p, adapter, rates));
      await seaStore.commit(run, products, rates);
      results.push({ source: adapter.id, status: 'success', count: products.length });
    } catch (e) {
      const code = safeCode(e);
      await seaStore.failure(run, code);
      results.push({ source: adapter.id, status: 'error', code });
    }
    console.info(JSON.stringify({ event: 'seatable_refresh', ...results[results.length - 1] }));
  }
  return { results, rateError };
}
