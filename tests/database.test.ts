import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { toProduct } from '../src/lib/server/adapters';
import { nativeRate } from '../src/lib/server/rates';
import { defaultFilters } from '../src/lib/types';
let database: PGlite;
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const makeProduct = (id: string, salePrice = '60') =>
  toProduct(
    {
      id,
      brand: 'Nike',
      name: 'Test ' + id,
      productUrl: 'https://www.nike.com/' + id,
      imageUrl: null,
      sizes: ['41', '42'],
      gender: 'men',
      category: 'Бег',
      available: true,
      originalPrice: '100',
      salePrice,
      currency: 'KZT',
      delivery: {
        country: 'KZ',
        basis: 'merchant-feed',
        checkedAt: new Date().toISOString(),
        policyUrl: 'https://www.nike.com/shipping',
      },
    },
    { id: 'nike', name: 'Nike' },
    [nativeRate()],
  );
async function commit(products: ReturnType<typeof makeProduct>[]) {
  await database.query('select commit_source_refresh($1,$2::jsonb,now(),$3::jsonb,$4::uuid)', [
    'nike',
    JSON.stringify(products),
    JSON.stringify([nativeRate()]),
    owner,
  ]);
}
async function catalog(filters = { ...defaultFilters }) {
  return (
    await database.query<{ result: { products: ReturnType<typeof makeProduct>[]; total: number } }>(
      'select search_catalog($1::jsonb,12,36) result',
      [JSON.stringify(filters)],
    )
  ).rows[0].result;
}
beforeAll(async () => {
  database = new PGlite();
  await database.exec(
    'create role anon; create role authenticated; create role service_role bypassrls;',
  );
  await database.exec(readFileSync('supabase/migrations/202609240001_initial.sql', 'utf8'));
  await database.exec(readFileSync('supabase/migrations/202609240002_partner_sources.sql', 'utf8'));
  await database.exec(readFileSync('supabase/migrations/202609240003_delivery_kz.sql', 'utf8'));
  await database.exec(
    readFileSync('supabase/migrations/202609240004_promotion_schedule.sql', 'utf8'),
  );
});
afterAll(async () => {
  await database.close();
});
describe('Postgres — настоящая миграция и RPC', () => {
  it('блокирует одновременные обновления и защищает освобождение lock', async () => {
    expect(
      (await database.query<{ ok: boolean }>('select acquire_refresh_lock($1::uuid) ok', [owner]))
        .rows[0].ok,
    ).toBe(true);
    expect(
      (await database.query<{ ok: boolean }>('select acquire_refresh_lock($1::uuid) ok', [other]))
        .rows[0].ok,
    ).toBe(false);
    await database.query('select release_refresh_lock($1::uuid)', [other]);
    expect((await database.query('select * from refresh_locks')).rows).toHaveLength(1);
  });
  it('атомарно загружает товары, курс и историю проверки', async () => {
    await commit([makeProduct('one'), makeProduct('two', '40')]);
    expect((await catalog()).total).toBe(2);
    expect((await database.query('select * from exchange_rates')).rows.length).toBeGreaterThan(0);
    expect((await database.query('select * from refresh_runs')).rows).toHaveLength(1);
    expect(
      (
        await database.query<{ last_error: null }>('select last_error from sources where id=$1', [
          'nike',
        ])
      ).rows[0].last_error,
    ).toBe(null);
  });
  it('применяет фильтры в SQL и не исполняет поисковый ввод', async () => {
    const result = await catalog({
      ...defaultFilters,
      sizes: ['42'],
      brands: ['Nike'],
      minDiscount: 50,
      gender: 'men',
    });
    expect(result.products.map((p) => p.externalId)).toEqual(['two']);
    expect((await catalog({ ...defaultFilters, q: "' OR 1=1 --" })).total).toBe(0);
  });
  it('не создаёт повторов и сохраняет первое появление', async () => {
    const before = (await catalog()).products.find((p) => p.externalId === 'one')!;
    await commit([makeProduct('one', '50')]);
    const after = await catalog();
    expect(after.total).toBe(1);
    expect(after.products[0].saleKzt).toBe(50);
    expect(new Date(after.products[0].firstSeenAt).getTime()).toBeCloseTo(
      new Date(before.firstSeenAt).getTime(),
      -2,
    );
    expect((await database.query('select * from offers')).rows).toHaveLength(2);
  });
  it('откатывает целиком некорректную загрузку', async () => {
    await expect(
      commit([makeProduct('three'), { ...makeProduct('bad'), saleKzt: -1 }]),
    ).rejects.toThrow();
    expect((await catalog()).products[0].externalId).toBe('one');
    expect(
      (await database.query("select * from offers where external_id='three'")).rows,
    ).toHaveLength(0);
  });
  it('не публикует товар без подтверждения доставки KZ', async () => {
    await expect(
      commit([{ ...makeProduct('no-shipping'), delivery: undefined }]),
    ).rejects.toThrow();
    expect((await catalog()).total).toBe(1);
  });
  it('сохраняет предложения при ошибке фида и записывает сбой', async () => {
    await database.query('select record_refresh_failure($1,now(),$2,$3::uuid)', [
      'nike',
      'UPSTREAM_UNAVAILABLE',
      owner,
    ]);
    expect((await catalog()).total).toBe(1);
    expect(
      (
        await database.query<{ last_error: string }>(
          "select last_error from sources where id='nike'",
        )
      ).rows[0].last_error,
    ).toBe('UPSTREAM_UNAVAILABLE');
  });
  it('скрывает приостановленный источник и устаревшие предложения', async () => {
    await database.exec("update sources set paused=true where id='nike'");
    expect((await catalog()).total).toBe(0);
    await database.exec(
      "update sources set paused=false where id='nike'; update offers set updated_at=now()-interval '40 hours'",
    );
    expect((await catalog()).total).toBe(0);
  });
  it('пустой подтверждённый снимок убирает прежние предложения', async () => {
    await commit([]);
    expect((await catalog()).total).toBe(0);
    expect(
      (
        await database.query<{ offer_count: number }>(
          "select offer_count from sources where id='nike'",
        )
      ).rows[0].offer_count,
    ).toBe(0);
  });
  it('сохраняет срок в транзакции и скрывает истёкшую акцию', async () => {
    const end = new Date(Date.now() + 7 * 86400000).toISOString();
    await commit([{ ...makeProduct('promotion'), saleEndsAt: end }]);
    const row = (
      await database.query<{ next_refresh_at: Date }>(
        "select next_refresh_at from sources where id='nike'",
      )
    ).rows[0];
    expect(new Date(row.next_refresh_at).toISOString()).toBe(end);
    await database.exec("update offers set updated_at=now()-interval '40 hours'");
    expect((await catalog()).total).toBe(1);
    await database.exec(
      "update offers set payload=jsonb_set(payload,'{saleEndsAt}',to_jsonb(now()-interval '1 second'))",
    );
    expect((await catalog()).total).toBe(0);
    await commit([]);
    expect(
      (
        await database.query<{ next_refresh_at: null }>(
          "select next_refresh_at from sources where id='nike'",
        )
      ).rows[0].next_refresh_at,
    ).toBeNull();
  });
  it('аноним не может читать таблицы и запускать обновление', async () => {
    const permissions = await database.query<{ table_access: boolean; function_access: boolean }>(
      "select has_table_privilege('anon','public.offers','SELECT') table_access,has_function_privilege('anon','public.acquire_refresh_lock(uuid)','EXECUTE') function_access",
    );
    expect(permissions.rows[0]).toEqual({ table_access: false, function_access: false });
  });
});
