import 'server-only';
import { randomUUID } from 'node:crypto';
import { db } from './db';
import { toProduct } from './adapters';
import { getAdapters } from './sources';
import { loadRates, nativeRate } from './rates';
import { IntegrationError, safeCode } from './http';
export async function refreshSources() {
  const client = db();
  const adapters = getAdapters();
  const deadline = Date.now() + 220_000;
  const owner = randomUUID();
  const { data: locked, error: lockError } = await client.rpc('acquire_refresh_lock', {
    owner_id: owner,
  });
  if (lockError) throw new IntegrationError('LOCK_FAILED');
  if (!locked) return { skipped: true, reason: 'already_running' };
  try {
    const { error: registryError } = await client.from('sources').upsert(
      adapters.map((a) => ({ id: a.id, name: a.name })),
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (registryError) throw new IntegrationError('SOURCE_REGISTRY_WRITE_FAILED');
    const { data: sources, error } = await client
      .from('sources')
      .select('id,paused,last_attempt_at');
    if (error) throw new IntegrationError('SOURCES_UNAVAILABLE');
    adapters.sort(
      (a, b) =>
        Date.parse(sources.find((s) => s.id === a.id)?.last_attempt_at || '1970-01-01') -
        Date.parse(sources.find((s) => s.id === b.id)?.last_attempt_at || '1970-01-01'),
    );
    const enabled = adapters.filter(
      (a) => a.configured() && sources.some((s) => s.id === a.id && !s.paused),
    );
    let rateError: string | null = null;
    const rates = enabled.length
      ? await loadRates().catch((e) => {
          rateError = safeCode(e);
          return [nativeRate()];
        })
      : [];
    const refreshOne = async (adapter: ReturnType<typeof getAdapters>[number]) => {
      if (sources.find((s) => s.id === adapter.id)?.paused)
        return { source: adapter.id, status: 'paused' };
      if (!adapter.configured()) return { source: adapter.id, status: 'needs_configuration' };
      if (Date.now() > deadline)
        return { source: adapter.id, status: 'error', code: 'REFRESH_BUDGET_EXHAUSTED' };
      const startedAt = new Date().toISOString();
      const { error: attemptError } = await client
        .from('sources')
        .update({ last_attempt_at: startedAt })
        .eq('id', adapter.id);
      if (attemptError) throw new IntegrationError('ATTEMPT_WRITE_FAILED');
      try {
        const feed = await adapter.fetchProducts();
        const products = feed.map((p) => toProduct(p, adapter, rates));
        const { error: commitError } = await client.rpc('commit_source_refresh', {
          source_id: adapter.id,
          items: products,
          started_at: startedAt,
          rate_records: rates,
          lock_owner: owner,
        });
        if (commitError) throw new IntegrationError('COMMIT_FAILED');
        console.info(
          JSON.stringify({
            event: 'source_refresh',
            source: adapter.id,
            count: products.length,
            status: 'success',
          }),
        );
        return { source: adapter.id, status: 'success', count: products.length };
      } catch (e) {
        const code = safeCode(e);
        const { error: failureError } = await client.rpc('record_refresh_failure', {
          source_id: adapter.id,
          started_at: startedAt,
          error_code: code,
          lock_owner: owner,
        });
        if (failureError) throw new IntegrationError('FAILURE_WRITE_FAILED');
        console.error(
          JSON.stringify({ event: 'source_refresh', source: adapter.id, status: 'error', code }),
        );
        return { source: adapter.id, status: 'error', code };
      }
    };
    const settled: PromiseSettledResult<Awaited<ReturnType<typeof refreshOne>>>[] = [];
    for (let offset = 0; offset < adapters.length; offset += 4) {
      settled.push(
        ...(await Promise.allSettled(adapters.slice(offset, offset + 4).map(refreshOne))),
      );
    }
    const results = settled.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { source: adapters[i].id, status: 'error', code: safeCode(r.reason) },
    );
    return { results, rateError };
  } finally {
    const { error } = await client.rpc('release_refresh_lock', { owner_id: owner });
    if (error) console.error(JSON.stringify({ event: 'lock_release_failed' }));
  }
}
