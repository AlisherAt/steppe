import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createHash } from 'node:crypto';
import { databaseConfigured, databaseProvider, db } from '@/lib/server/db';
import { seaClient } from '@/lib/server/seatable-client';
export const dynamic = 'force-dynamic';
const key = createHash('sha256')
  .update(
    `${process.env.SEATABLE_API_TOKEN}|${process.env.SEATABLE_SERVER_URL}|${process.env.SEATABLE_BASE_NAME}|${process.env.SEATABLE_WORKSPACE_ID}|${process.env.SUPABASE_URL}`,
  )
  .digest('hex');
const check = unstable_cache(
  async (provider: string) => {
    if (provider === 'seatable') await seaClient.ensureSchema();
    else {
      const { error } = await db().from('sources').select('id').limit(1);
      if (error) throw new Error('DATABASE_UNAVAILABLE');
    }
    return new Date().toISOString();
  },
  ['database-health', key],
  { revalidate: 60 },
);
export async function GET() {
  try {
    const database = databaseProvider();
    if (!databaseConfigured())
      return NextResponse.json({ status: 'not_configured', database }, { status: 503 });
    const checkedAt = await check(database);
    return NextResponse.json(
      { status: 'ok', database, checkedAt },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Не удалось проверить подключение и структуру базы.' },
      { status: 503 },
    );
  }
}
