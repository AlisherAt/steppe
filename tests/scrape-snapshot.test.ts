import { expect, it } from 'vitest';
import { selectScrapeSnapshot } from '../src/lib/server/scrape-snapshot';
import type { SeaRow } from '../src/lib/server/seatable-client';

const now = Date.now();
const iso = (age = 0) => new Date(now - age).toISOString();
function snapshot(
  id: string,
  status: string,
  age: number,
  products: { id: string; source?: string; sourceUpdatedAt?: string }[] = [],
): SeaRow[] {
  return [
    {
      _id: id,
      id,
      checked_at: iso(age),
      payload: JSON.stringify({ reports: [{ source: 'puma', status }] }),
    },
    ...products.map((p, i) => ({
      _id: `${id}:${i}`,
      id: `${id}:${i}`,
      payload: JSON.stringify({ source: 'puma', sourceUpdatedAt: iso(age), ...p }),
    })),
  ];
}
const convert = (raw: unknown) => raw as { id: string; sourceUpdatedAt: string };

it('ошибка облачного сборщика не перекрывает подтверждённый локальный снимок', () => {
  const rows = [
    ...snapshot('local', 'partial', 60000, [{ id: 'shoe' }]),
    ...snapshot('cloud', 'error', 0),
  ];
  expect(selectScrapeSnapshot(rows, 'puma', convert, now)?.map((p) => p.id)).toEqual(['shoe']);
});

it('пустой или неподтверждённый запуск не очищает каталог другого сборщика', () => {
  const rows = [
    ...snapshot('local', 'partial', 60000, [{ id: 'shoe' }]),
    ...snapshot('cloud', 'no_valid_products', 0),
  ];
  expect(selectScrapeSnapshot(rows, 'puma', convert, now)).toHaveLength(1);
  expect(
    selectScrapeSnapshot([...rows, ...snapshot('empty', 'partial', 0)], 'puma', convert, now),
  ).toHaveLength(1);
  expect(selectScrapeSnapshot(rows, 'puma', () => null, now)).toBeNull();
});

it('сравнивается возраст цен, а не время отправки; снимки и размеры не объединяются', () => {
  const rows = [
    ...snapshot('local', 'partial', 10000, [{ id: 'new' }]),
    ...snapshot('cloud-late', 'partial', 0, [{ id: 'older', sourceUpdatedAt: iso(60000) }]),
  ];
  const result = selectScrapeSnapshot(rows, 'puma', convert, now)!;
  expect(result.map((p) => p.id)).toEqual(['new']);
  expect(result[0].sourceUpdatedAt).toBe(iso(10000));
});

it('истёкшие 36 часов и будущее время не становятся свежими при повторном импорте', () => {
  expect(
    selectScrapeSnapshot(
      snapshot('old', 'partial', 37 * 3600000, [{ id: 'old' }]),
      'puma',
      convert,
      now,
    ),
  ).toBeNull();
  expect(
    selectScrapeSnapshot(
      snapshot('late', 'partial', 0, [{ id: 'old', sourceUpdatedAt: iso(37 * 3600000) }]),
      'puma',
      convert,
      now,
    ),
  ).toBeNull();
  expect(
    selectScrapeSnapshot(
      snapshot('future', 'partial', -120000, [{ id: 'future' }]),
      'puma',
      convert,
      now,
    ),
  ).toBeNull();
});

it('источники и незавершённые загрузки изолированы; дубли отклоняются', () => {
  const rows = snapshot('local', 'partial', 0, [
    { id: 'puma' },
    { id: 'reebok', source: 'reebok' },
  ]);
  expect(selectScrapeSnapshot(rows, 'puma', convert, now)?.map((p) => p.id)).toEqual(['puma']);
  expect(selectScrapeSnapshot(rows.slice(1), 'puma', convert, now)).toBeNull();
  expect(() =>
    selectScrapeSnapshot(
      snapshot('dup', 'partial', 0, [{ id: 'a' }, { id: 'a' }]),
      'puma',
      convert,
      now,
    ),
  ).toThrow('DUPLICATE_SCRAPE_SNAPSHOT');
});
