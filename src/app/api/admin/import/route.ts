import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/admin-access';
import { adminBody, adminError, adminJson } from '@/lib/server/admin-response';
import { importProductLink } from '@/lib/server/link-import';
import { manualProducts } from '@/lib/server/manual-products';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin(req, true);
    const { url } = z.object({ url: z.string().url().max(2000) }).parse(await adminBody(req));
    const { product, from } = await importProductLink(url);
    return adminJson({ ...(await manualProducts.createDraft(product, user.id)), from });
  } catch (error) {
    return adminError(error);
  }
}
