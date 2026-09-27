import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/admin-access';
import { adminBody, adminError, adminJson } from '@/lib/server/admin-response';
import { githubProcurement } from '@/lib/server/github-catalog';
import { matchesProcurement, parseWhatsappOrder } from '@/lib/procurement';
import { localSizeLabel } from '@/lib/size-guide';
import { officialMarketUrl } from '@/lib/official-stores';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const options = z.object({
  q: z.string().max(500).default(''),
  source: z.string().max(80).default(''),
  department: z.enum(['', 'sneakers', 'sportswear', 'casual']).default(''),
  state: z.enum(['all', 'active', 'stale', 'hidden', 'archived']).default('all'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
// Никакие ссылки поставщиков не покидают endpoint до проверки сессии и роли.
const entries = () =>
  githubProcurement().map((e) => ({
    ...e,
    product: {
      ...e.product,
      productUrl: officialMarketUrl(e.product.productUrl, e.product.market)
        ? e.product.productUrl
        : '',
    },
  }));
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const f = options.parse(Object.fromEntries(req.nextUrl.searchParams));
    const all = entries();
    const result = all.filter(
      (e) =>
        matchesProcurement(e, f.q) &&
        (!f.source || e.product.sourceId === f.source) &&
        (!f.department || (e.product.department || 'sneakers') === f.department) &&
        (f.state === 'all' ||
          (f.state === 'active' && !e.hidden && !e.stale) ||
          (f.state === 'stale' && e.stale) ||
          (f.state === 'hidden' && e.hidden) ||
          (f.state === 'archived' && e.archived)),
    );
    return adminJson({
      products: result.slice((f.page - 1) * 24, f.page * 24),
      total: result.length,
      page: f.page,
      pages: Math.ceil(result.length / 24),
      sources: [
        ...new Map(
          all.map((e) => [
            e.product.sourceId,
            { id: e.product.sourceId, name: e.product.sourceName },
          ]),
        ).values(),
      ],
    });
  } catch (e) {
    return adminError(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req, true);
    const input = z
      .object({
        text: z.string().max(20000).optional(),
        items: z
          .array(
            z.object({
              id: z.string().regex(/^[a-f0-9]{64}$/),
              size: z.string().max(80).nullable(),
            }),
          )
          .min(1)
          .max(50)
          .optional(),
      })
      .refine((v) => Boolean(v.text) !== Boolean(v.items))
      .parse(await adminBody(req));
    let selected;
    try {
      selected = input.items || parseWhatsappOrder(input.text!);
    } catch (e) {
      return adminJson(
        { error: e instanceof Error ? e.message : 'Не удалось прочитать заказ.' },
        400,
      );
    }
    const all = entries();
    return adminJson({
      items: selected.map((item) => {
        const entry = all.find((e) => e.product.id === item.id);
        const native = entry?.product.sizes.find(
          (s) => s === item.size || localSizeLabel(entry.product, s) === item.size,
        );
        return {
          id: item.id,
          requestedSize: item.size,
          size: native || null,
          sizeUnavailable: Boolean(item.size && !native),
          entry: entry || null,
        };
      }),
    });
  } catch (e) {
    return adminError(e);
  }
}
