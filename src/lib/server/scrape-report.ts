import { z } from 'zod';
import { seaClient } from './seatable-client';
import { pumaVariantSchema, pumaVerifiedSchema } from '../puma';
import { retailVariantSchema, retailScrapeSchema } from '../retail-scrapes';
import { packScrapeProducts, scrapeProductsHash, scrapeChunkFormat } from './scrape-chunks';
export const scrapeReportSchema = z.object({
  runId: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
  checkedAt: z.string().datetime({ offset: true }),
  published: z.literal(0),
  reports: z
    .array(
      z.object({
        source: z.string().max(50),
        brand: z.string().max(80),
        status: z.enum([
          'needs_permission',
          'time_limit',
          'partial',
          'finished_observed_pages',
          'no_valid_products',
          'error',
        ]),
        count: z.number().int().min(0).max(10000),
        error: z.string().max(200).optional(),
      }),
    )
    .max(15),
  products: z
    .array(
      z
        .object({
          source: z.string().max(50),
          brand: z.string().max(80),
          sku: z.string().min(1).max(160),
          name: z.string().min(1).max(180),
          image_url: z.string().url().max(2000),
          image_urls: z.array(z.string().url().max(2000)).max(10).optional(),
          color: z.string().max(300).optional(),
          usage: z.string().max(500).optional(),
          product_url: z.string().url().max(2000),
          old_price: z.number().positive(),
          sale_price: z.number().positive(),
          currency: z.enum(['USD', 'EUR']),
          checked_at: z.string().datetime({ offset: true }),
          size_price_verified: z.boolean(),
          size_candidates: z.array(z.string().min(1).max(40)).max(60).optional(),
          gender: z.enum(['men', 'women', 'kids', 'unisex']).optional(),
          variants: z
            .array(z.union([retailVariantSchema, pumaVariantSchema]))
            .max(60)
            .optional(),
        })
        .refine((p) => p.sale_price < p.old_price)
        .refine(
          (p) =>
            !p.size_price_verified ||
            pumaVerifiedSchema.safeParse(p).success ||
            retailScrapeSchema.safeParse(p).success,
        ),
    )
    .max(10000),
});
export function scrapeObservedAt(report: {
  checkedAt: string;
  products: { checked_at: string }[];
}) {
  // Старые сборщики ставили время начала. Учитываем фактическое время наблюдений,
  // чтобы закончившийся позже сбор не проигрывал промежуточному ручному отчёту.
  return new Date(
    Math.max(Date.parse(report.checkedAt), ...report.products.map((p) => Date.parse(p.checked_at))),
  ).toISOString();
}
export async function storeScrapeReport(input: z.infer<typeof scrapeReportSchema>) {
  const report = { ...input, checkedAt: scrapeObservedAt(input) };
  const rows = await seaClient.rows('STEPPE_Scrapes');
  if (rows.some((r) => r.id === report.runId)) return;
  // Компактные блоки экономят строки и API-вызовы, не превышая лимит Long Text.
  const chunks = packScrapeProducts(report.products);
  const prefix = `${report.runId}:`;
  const partial = rows.filter((r) => String(r.id).startsWith(prefix));
  if (partial.length)
    await seaClient.remove(
      'STEPPE_Scrapes',
      partial.map((r) => r._id),
    );
  await seaClient.append(
    'STEPPE_Scrapes',
    chunks.map((payload, index) => ({
      id: `${prefix}${index}`,
      checked_at: report.checkedAt,
      payload,
    })),
  );
  await seaClient.append('STEPPE_Scrapes', [
    {
      id: report.runId,
      checked_at: report.checkedAt,
      payload: JSON.stringify({
        ...report,
        products: [],
        storageFormat: scrapeChunkFormat,
        chunkCount: chunks.length,
        checksum: scrapeProductsHash(report.products),
        collectedCount: report.products.length,
        verifiedCount: report.products.filter((p) => p.size_price_verified).length,
      }),
    },
  ]);
  const expired = rows.filter((r) => Date.parse(String(r.checked_at)) < Date.now() - 36 * 3600_000);
  if (expired.length)
    await seaClient.remove(
      'STEPPE_Scrapes',
      expired.map((r) => r._id),
    );
}
export async function scrapeSummary() {
  if (!process.env.SEATABLE_API_TOKEN) return null;
  const rows = await seaClient.rows('STEPPE_Scrapes');
  const latest = rows
    .filter((r) => !String(r.id).includes(':'))
    .sort((a, b) => String(b.checked_at).localeCompare(String(a.checked_at)))[0];
  if (!latest) return null;
  const parsed = scrapeReportSchema
    .extend({
      collectedCount: z.number().int().min(0).max(10000).optional(),
      verifiedCount: z.number().int().min(0).max(10000).optional(),
    })
    .safeParse(JSON.parse(String(latest.payload)));
  if (!parsed.success) return null;
  return {
    checkedAt: parsed.data.checkedAt,
    collected: parsed.data.collectedCount ?? parsed.data.products.length,
    verified: parsed.data.verifiedCount ?? 0,
    sources: parsed.data.reports.length,
    waiting: parsed.data.reports.filter((r) => r.status === 'needs_permission').length,
    failed: parsed.data.reports.filter((r) => r.status === 'error').length,
  };
}
