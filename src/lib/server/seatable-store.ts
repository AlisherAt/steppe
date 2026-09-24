import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Product, Rate } from '../types';
import { feedProductSchema, type SourceAdapter } from './adapters';
import { seaClient, type SeaRow, type SeaTransport } from './seatable-client';
import { IntegrationError } from './http';
import { offerVisible, nextPromotionRefresh } from '../promotion';
const iso = z.string().datetime({ offset: true });
const secureUrl = z
  .string()
  .url()
  .refine((s) => {
    const u = new URL(s);
    return u.protocol === 'https:' && !u.username && !u.password;
  });
const productSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{64}$/),
    externalId: z.string().min(1),
    sourceId: z.string().min(1),
    sourceName: z.string().min(1),
    brand: z.string().min(1),
    name: z.string().min(1),
    imageUrl: secureUrl.nullable(),
    productUrl: secureUrl,
    sizes: z.array(z.string()),
    gender: z.enum(['men', 'women', 'unisex', 'kids']),
    category: z.string(),
    originalPrice: z.string(),
    salePrice: z.string(),
    currency: z.string(),
    originalKzt: z.number().int().positive(),
    saleKzt: z.number().int().positive(),
    discount: z.number().int().min(0).max(100),
    demo: z.literal(false),
    saleStartsAt: iso.optional(),
    saleEndsAt: iso.optional(),
    updatedAt: iso,
    firstSeenAt: iso,
    rate: z.object({
      currency: z.string(),
      value: z.string(),
      source: z.string(),
      asOf: iso,
      fetchedAt: iso,
    }),
    delivery: z.object({
      country: z.literal('KZ'),
      basis: z.enum(['merchant-feed', 'ebay-filter']),
      checkedAt: iso,
      policyUrl: secureUrl,
    }),
  })
  .refine(
    (p) =>
      p.saleKzt <= p.originalKzt && feedProductSchema.safeParse({ ...p, id: p.externalId }).success,
  );
export type SeaSource = { _id: string; id: string; name: string; paused: boolean };
export type SeaRun = {
  _id: string;
  id: string;
  source_id: string;
  started_at: string;
  finished_at: string;
  status: 'running' | 'success' | 'error';
  count: number;
  checksum: string;
  error: string;
};
const runSchema = z.object({
  _id: z.string(),
  id: z.string().uuid(),
  source_id: z.string(),
  started_at: iso,
  finished_at: iso.nullish(),
  status: z.enum(['running', 'success', 'error']),
  count: z.number().int().nonnegative().nullish(),
  checksum: z.string().nullish(),
  error: z.string().nullish(),
});
function parseRuns(rows: SeaRow[]): SeaRun[] {
  return rows.map((row) => {
    const r = runSchema.safeParse(row);
    if (!r.success) throw new IntegrationError('SEATABLE_INVALID_RUN');
    return {
      ...r.data,
      finished_at: r.data.finished_at || '',
      count: r.data.count || 0,
      checksum: r.data.checksum || '',
      error: r.data.error || '',
    };
  });
}
export function latestRun(runs: SeaRun[], source: string, successOnly = false) {
  return runs
    .filter((r) => r.source_id === source && (!successOnly || r.status === 'success'))
    .sort((a, b) => b.started_at.localeCompare(a.started_at) || b.id.localeCompare(a.id))[0];
}
export function snapshotHash(products: Product[]) {
  return createHash('sha256')
    .update(JSON.stringify([...products].sort((a, b) => a.id.localeCompare(b.id))))
    .digest('hex');
}
export function decodeSnapshot(run: SeaRun, offers: SeaRow[]): Product[] {
  if (run.status !== 'success') return [];
  const matching = offers.filter((row) => row.snapshot === run.id);
  let products: Product[];
  try {
    products = matching.map((row) => {
      const p = productSchema.parse(JSON.parse(String(row.payload)));
      if (
        p.sourceId !== run.source_id ||
        p.id !== row.product_id ||
        row.source_id !== run.source_id
      )
        throw new Error();
      return p;
    });
  } catch {
    throw new IntegrationError('SEATABLE_INVALID_PRODUCT');
  }
  if (
    products.length !== run.count ||
    new Set(products.map((p) => p.id)).size !== products.length ||
    snapshotHash(products) !== run.checksum
  )
    throw new IntegrationError('SEATABLE_INCOMPLETE_SNAPSHOT');
  return products;
}
export class SeaTableStore {
  constructor(private client: SeaTransport) {}
  async sources(): Promise<SeaSource[]> {
    const rows = await this.client.rows('STEPPE_Sources');
    const result = rows.map((row) => {
      const r = z
        .object({
          _id: z.string(),
          id: z.string().min(1),
          name: z.string().min(1),
          paused: z.boolean().nullish(),
        })
        .safeParse(row);
      if (!r.success) throw new IntegrationError('SEATABLE_INVALID_SOURCE');
      return { ...r.data, paused: r.data.paused === true };
    });
    if (new Set(result.map((r) => r.id)).size !== result.length)
      throw new IntegrationError('SEATABLE_DUPLICATE_SOURCE');
    return result;
  }
  async ensureSources(adapters: Pick<SourceAdapter, 'id' | 'name'>[]) {
    const sources = await this.sources();
    await this.client.append(
      'STEPPE_Sources',
      adapters
        .filter((a) => !sources.some((s) => s.id === a.id))
        .map((a) => ({ id: a.id, name: a.name, paused: false })),
    );
    return this.sources();
  }
  async runs() {
    return parseRuns(await this.client.rows('STEPPE_Runs'));
  }
  async state() {
    const [sources, runs] = await Promise.all([this.sources(), this.runs()]);
    // Read offers after manifests: a manifest is written only after all of its rows exist.
    const offers = runs.some((r) => r.status === 'success' && r.count > 0)
      ? await this.client.rows('STEPPE_Offers')
      : [];
    return { sources, runs, offers };
  }
  async liveProducts(now = new Date()) {
    const { sources, runs, offers } = await this.state();
    return sources.flatMap((source) => {
      const run = latestRun(runs, source.id, true);
      if (source.paused || !run || !run.finished_at) return [];
      return decodeSnapshot(run, offers).filter((p) => offerVisible(p, now.getTime()));
    });
  }
  async sourceStatuses() {
    const { sources, runs, offers } = await this.state();
    return sources.map((s) => {
      const last = latestRun(runs, s.id),
        success = latestRun(runs, s.id, true);
      const hung = last?.status === 'running' && Date.now() - Date.parse(last.started_at) > 360000;
      return {
        ...s,
        next_refresh_at: success ? nextPromotionRefresh(decodeSnapshot(success, offers)) : null,
        last_attempt_at: last?.started_at || null,
        last_success_at: success?.finished_at || null,
        last_error: last?.status === 'error' ? last.error : hung ? 'INTERRUPTED_REFRESH' : null,
        offer_count: success?.count || 0,
      };
    });
  }
  async start(source: string): Promise<SeaRun> {
    const id = randomUUID();
    await this.client.append('STEPPE_Runs', [
      { id, source_id: source, started_at: new Date().toISOString(), status: 'running', count: 0 },
    ]);
    const matching = (await this.runs()).filter((r) => r.id === id);
    if (matching.length !== 1) throw new IntegrationError('SEATABLE_RUN_NOT_CREATED');
    return matching[0];
  }
  async commit(run: SeaRun, products: Product[], rates: Rate[]) {
    if (products.length > 1000 || new Set(products.map((p) => p.id)).size !== products.length)
      throw new IntegrationError('INVALID_BATCH');
    const clean: Product[] = products.map((p) => {
      const r = productSchema.safeParse(p);
      if (!r.success || p.sourceId !== run.source_id) throw new IntegrationError('INVALID_PRODUCT');
      return r.data;
    });
    const previous = latestRun(await this.runs(), run.source_id, true);
    if (previous) {
      const old = decodeSnapshot(previous, await this.client.rows('STEPPE_Offers'));
      const firstSeen = new Map(old.map((p) => [p.id, p.firstSeenAt]));
      for (const p of clean) p.firstSeenAt = firstSeen.get(p.id) || p.firstSeenAt;
    }
    const rows = clean.map((p) => ({
      key: `${run.id}:${p.id}`,
      snapshot: run.id,
      source_id: run.source_id,
      product_id: p.id,
      created_at: new Date().toISOString(),
      payload: JSON.stringify(p),
    }));
    await this.client.append('STEPPE_Offers', rows);
    const candidate = {
      ...run,
      status: 'success' as const,
      count: clean.length,
      checksum: snapshotHash(clean),
    };
    decodeSnapshot(candidate, await this.client.rows('STEPPE_Offers'));
    if (!(await this.sources()).some((s) => s.id === run.source_id && !s.paused))
      throw new IntegrationError('SOURCE_PAUSED');
    await this.client.update('STEPPE_Runs', run._id, {
      status: 'success',
      finished_at: new Date().toISOString(),
      count: clean.length,
      checksum: candidate.checksum,
      rates: JSON.stringify(rates),
      error: '',
    });
  }
  async failure(run: SeaRun, code: string) {
    // A lost response to commit may still have published it. Do not overwrite a confirmed success.
    if ((await this.runs()).find((r) => r.id === run.id)?.status === 'success') return;
    await this.client.update('STEPPE_Runs', run._id, {
      status: 'error',
      finished_at: new Date().toISOString(),
      error: code,
    });
  }
  async prune(now = new Date()) {
    const runs = await this.runs();
    const keep = new Set(
      [...new Set(runs.map((r) => r.source_id))].map((id) => latestRun(runs, id, true)?.id),
    );
    const cutoff = now.getTime() - 2 * 3600000;
    const offers = await this.client.rows('STEPPE_Offers');
    // The grace period starts when a replacement was published, not when the old row was created.
    const obsolete = new Set(
      runs
        .filter(
          (r) =>
            !keep.has(r.id) &&
            (r.status !== 'success'
              ? Date.parse(r.started_at) < cutoff
              : runs.some(
                  (newer) =>
                    newer.source_id === r.source_id &&
                    newer.status === 'success' &&
                    (newer.started_at > r.started_at ||
                      (newer.started_at === r.started_at && newer.id > r.id)) &&
                    Date.parse(newer.finished_at) < cutoff,
                )),
        )
        .map((r) => r.id),
    );
    await this.client.remove(
      'STEPPE_Offers',
      offers
        .filter(
          (r) => obsolete.has(String(r.snapshot)) && Date.parse(String(r.created_at)) < cutoff,
        )
        .map((r) => r._id),
    );
    await this.client.remove(
      'STEPPE_Runs',
      runs
        .filter(
          (r) => obsolete.has(r.id) && Date.parse(r.started_at) < now.getTime() - 7 * 86400000,
        )
        .map((r) => r._id),
    );
  }
}
export const seaStore = new SeaTableStore(seaClient);
