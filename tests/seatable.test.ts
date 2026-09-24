import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeaTableStore } from '../src/lib/server/seatable-store';
import { SeaTableClient, type SeaRow, type SeaTransport } from '../src/lib/server/seatable-client';
import { toProduct } from '../src/lib/server/adapters';
import { nativeRate } from '../src/lib/server/rates';
import { fetchText } from '../src/lib/server/http';
vi.mock('../src/lib/server/http', async (original) => ({
  ...(await original<object>()),
  fetchText: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.useRealTimers();
});
class MemorySea implements SeaTransport {
  data: Record<string, SeaRow[]> = {
    STEPPE_Sources: [{ _id: 'source', id: 'nike', name: 'Nike', paused: false }],
    STEPPE_Offers: [],
    STEPPE_Runs: [],
  };
  failOffers = false;
  sequence = 0;
  async rows(table: string) {
    return structuredClone(this.data[table]);
  }
  async append(table: string, rows: Record<string, unknown>[]) {
    for (const row of rows) {
      this.data[table].push({ ...structuredClone(row), _id: `row-${++this.sequence}` });
      if (this.failOffers && table === 'STEPPE_Offers') throw new Error('network');
    }
  }
  async update(table: string, id: string, row: Record<string, unknown>) {
    Object.assign(
      this.data[table].find((r) => r._id === id)!,
      structuredClone(row),
    );
  }
  async remove(table: string, ids: string[]) {
    this.data[table] = this.data[table].filter((r) => !ids.includes(r._id));
  }
}
const product = (id = 'one', salePrice = '60') =>
  toProduct(
    {
      id,
      brand: 'Nike',
      name: 'Fixture sneakers',
      productUrl: `https://www.nike.com/${id}`,
      imageUrl: null,
      sizes: ['42'],
      gender: 'unisex',
      category: 'Кроссовки',
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
describe('SeaTable — целые снимки и отсутствие SQL-транзакций', () => {
  it('публикует полный снимок, сохраняет исходную цену и обновляет размеры/цены', async () => {
    const memory = new MemorySea(),
      store = new SeaTableStore(memory);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
    const run = await store.start('nike');
    await store.commit(run, [product()], [nativeRate()]);
    const first = (await store.liveProducts())[0];
    expect(first).toMatchObject({ originalPrice: '100', salePrice: '60', saleKzt: 60 });
    vi.advanceTimersByTime(1000);
    await store.commit(
      await store.start('nike'),
      [{ ...product('one', '50'), sizes: ['43'] }],
      [nativeRate()],
    );
    expect(await store.liveProducts()).toHaveLength(1);
    expect((await store.liveProducts())[0]).toMatchObject({
      firstSeenAt: first.firstSeenAt,
      saleKzt: 50,
      sizes: ['43'],
    });
    expect((await store.sourceStatuses())[0].offer_count).toBe(1);
  });
  it('не публикует частично записанный снимок при сбое', async () => {
    const memory = new MemorySea(),
      store = new SeaTableStore(memory);
    await store.commit(await store.start('nike'), [product('original')], []);
    memory.failOffers = true;
    const next = await store.start('nike');
    await expect(store.commit(next, [product('new1'), product('new2')], [])).rejects.toThrow(
      'network',
    );
    await store.failure(next, 'UPSTREAM_UNAVAILABLE');
    expect((await store.liveProducts()).map((p) => p.externalId)).toEqual(['original']);
  });
  it('пустой успешный снимок скрывает исчезнувшие товары', async () => {
    vi.useFakeTimers();
    const memory = new MemorySea(),
      store = new SeaTableStore(memory);
    await store.commit(await store.start('nike'), [product()], []);
    vi.advanceTimersByTime(1000);
    await store.commit(await store.start('nike'), [], []);
    expect(await store.liveProducts()).toEqual([]);
  });
  it('отклоняет демо, неизвестную доставку, повторы и повреждённые строки', async () => {
    const memory = new MemorySea(),
      store = new SeaTableStore(memory),
      run = await store.start('nike');
    await expect(store.commit(run, [{ ...product(), demo: true }], [])).rejects.toThrow(
      'INVALID_PRODUCT',
    );
    await expect(store.commit(run, [{ ...product(), delivery: undefined }], [])).rejects.toThrow(
      'INVALID_PRODUCT',
    );
    await expect(store.commit(run, [product(), product()], [])).rejects.toThrow('INVALID_BATCH');
    await store.commit(run, [product()], []);
    memory.data.STEPPE_Offers[0].payload = JSON.stringify({
      ...JSON.parse(String(memory.data.STEPPE_Offers[0].payload)),
      saleKzt: 1,
    });
    await expect(store.liveProducts()).rejects.toThrow('INCOMPLETE_SNAPSHOT');
  });
  it('позднее завершение старой задачи не перезаписывает новую', async () => {
    vi.useFakeTimers();
    const memory = new MemorySea(),
      store = new SeaTableStore(memory);
    const old = await store.start('nike');
    vi.advanceTimersByTime(1000);
    const latest = await store.start('nike');
    await store.commit(latest, [product('new')], []);
    await store.commit(old, [product('old')], []);
    expect((await store.liveProducts()).map((p) => p.externalId)).toEqual(['new']);
  });
  it('скрывает паузу и просрочку, запрещает commit при паузе', async () => {
    const memory = new MemorySea(),
      store = new SeaTableStore(memory);
    await store.commit(await store.start('nike'), [product()], []);
    memory.data.STEPPE_Sources[0].paused = true;
    expect(await store.liveProducts()).toEqual([]);
    await expect(store.commit(await store.start('nike'), [product()], [])).rejects.toThrow(
      'SOURCE_PAUSED',
    );
    memory.data.STEPPE_Sources[0].paused = false;
    expect(await store.liveProducts(new Date(Date.now() + 40 * 3600000))).toEqual([]);
  });
  it('сохраняет подтверждённый успех при потере HTTP-ответа', async () => {
    const memory = new MemorySea(),
      store = new SeaTableStore(memory),
      run = await store.start('nike');
    await store.commit(run, [product()], []);
    await store.failure(run, 'NETWORK_ERROR');
    expect((await store.runs())[0].status).toBe('success');
  });
  it('очищает только старые ненужные снимки и замечает зависший запуск', async () => {
    vi.useFakeTimers();
    const memory = new MemorySea(),
      store = new SeaTableStore(memory);
    await store.commit(await store.start('nike'), [product('old')], []);
    vi.advanceTimersByTime(3 * 3600000);
    await store.commit(await store.start('nike'), [product('new')], []);
    await store.prune();
    expect(memory.data.STEPPE_Offers).toHaveLength(2);
    vi.advanceTimersByTime(3 * 3600000);
    await store.prune();
    expect(memory.data.STEPPE_Offers).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    await store.start('nike');
    vi.advanceTimersByTime(7 * 60000);
    expect((await store.sourceStatuses())[0].last_error).toBe('INTERRUPTED_REFRESH');
    expect(await store.liveProducts()).toHaveLength(1);
  });
  it('не сбрасывает паузу при регистрации магазинов', async () => {
    const memory = new MemorySea(),
      store = new SeaTableStore(memory);
    memory.data.STEPPE_Sources[0].paused = true;
    const sources = await store.ensureSources([
      { id: 'nike', name: 'Nike' },
      { id: 'adidas', name: 'Adidas' },
    ]);
    expect(sources).toHaveLength(2);
    expect(sources[0].paused).toBe(true);
  });
});
describe('SeaTable API — токены, пагинация, ошибки', () => {
  const auth = {
    access_token: 'fixture-base-token',
    dtable_uuid: '12345678-1234-4234-8234-123456789abc',
    dtable_name: 'Steppe',
    workspace_id: 1,
  };
  function configure() {
    vi.stubEnv('SEATABLE_API_TOKEN', 'fixture-api-token');
    vi.stubEnv('SEATABLE_SERVER_URL', 'https://cloud.seatable.io');
    vi.stubEnv('SEATABLE_WORKSPACE_ID', '1');
    vi.stubEnv('SEATABLE_BASE_NAME', 'Steppe');
  }
  it('объединяет параллельную авторизацию и обновляет временный токен', async () => {
    configure();
    vi.useFakeTimers();
    vi.mocked(fetchText).mockResolvedValue(JSON.stringify(auth));
    const client = new SeaTableClient();
    await Promise.all([client.authenticate(), client.authenticate()]);
    expect(fetchText).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(51 * 60000);
    await client.authenticate();
    expect(fetchText).toHaveBeenCalledTimes(2);
  });
  it('не принимает токен другой базы', async () => {
    configure();
    vi.mocked(fetchText).mockResolvedValue(JSON.stringify({ ...auth, dtable_name: 'Other' }));
    await expect(new SeaTableClient().authenticate()).rejects.toThrow('WRONG_BASE');
  });
  it('читает все страницы по 1000 строк и не скрывает повреждённый ответ', async () => {
    configure();
    vi.mocked(fetchText)
      .mockResolvedValueOnce(JSON.stringify(auth))
      .mockResolvedValueOnce(
        JSON.stringify({ rows: Array.from({ length: 1000 }, (_, i) => ({ _id: String(i) })) }),
      )
      .mockResolvedValueOnce(JSON.stringify({ rows: [{ _id: '1000' }] }))
      .mockResolvedValueOnce('{}');
    const client = new SeaTableClient();
    expect(await client.rows('STEPPE_Offers')).toHaveLength(1001);
    expect(vi.mocked(fetchText).mock.calls[2][0]).toContain('start=1000');
    await expect(client.rows('STEPPE_Offers')).rejects.toThrow('INVALID_ROWS');
  });
  it('запись не повторяется при неоднозначном сетевом сбое', async () => {
    configure();
    vi.mocked(fetchText)
      .mockResolvedValueOnce(JSON.stringify(auth))
      .mockRejectedValueOnce(new Error('lost response'));
    await expect(new SeaTableClient().append('STEPPE_Offers', [{ key: 'a' }])).rejects.toThrow();
    expect(vi.mocked(fetchText).mock.calls[1][1].attempts).toBe(1);
  });
});
