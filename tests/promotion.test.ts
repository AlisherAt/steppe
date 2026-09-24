import { describe, expect, it } from 'vitest';
import { nextPromotionRefresh, offerVisible } from '../src/lib/promotion';
import { demoProducts } from '../src/lib/demo';
import { feedProductSchema, deduplicate } from '../src/lib/server/adapters';
const start = '2026-09-24T10:00:00Z';
const end = '2026-10-01T10:00:00Z';
const now = Date.parse(start);
const product = { ...demoProducts[0], demo: false, updatedAt: start, saleEndsAt: end };
describe('Планирование по срокам акций', () => {
  it('пропускает неделю, возвращает источник в расписание точно в конце', () => {
    expect(nextPromotionRefresh([product], now)).toBe('2026-10-01T10:00:00.000Z');
    expect(nextPromotionRefresh([product], Date.parse(end))).toBeNull();
    expect(offerVisible(product, Date.parse(end))).toBe(false);
  });
  it('выбирает ближайший срок и не откладывает смешанный/пустой каталог', () => {
    const earlier = { ...product, saleEndsAt: '2026-09-25T10:00:00Z' };
    expect(nextPromotionRefresh([product, earlier], now)).toBe('2026-09-25T10:00:00.000Z');
    expect(nextPromotionRefresh([product, { ...product, saleEndsAt: undefined }], now)).toBeNull();
    expect(nextPromotionRefresh([], now)).toBeNull();
  });
  it('не скрывает недельную акцию по обычному TTL, но сохраняет TTL без срока', () => {
    expect(offerVisible(product, now + 6 * 86400000)).toBe(true);
    expect(offerVisible({ ...product, saleEndsAt: undefined }, now + 6 * 86400000)).toBe(false);
    expect(offerVisible({ ...product, saleEndsAt: 'invalid' }, now)).toBe(false);
  });
  it('ограничивает паузу 31 днём и не показывает будущую акцию', () => {
    expect(nextPromotionRefresh([{ ...product, saleEndsAt: '2027-01-01T00:00:00Z' }], now)).toBe(
      '2026-10-25T10:00:00.000Z',
    );
    expect(offerVisible({ ...product, saleStartsAt: end }, now)).toBe(false);
  });
  it('валидирует интервал и отвергает дубликаты с разными сроками', () => {
    const p = feedProductSchema.parse({ ...product, id: 'fixture', available: true });
    expect(
      feedProductSchema.safeParse({ ...p, saleStartsAt: end, saleEndsAt: start }).success,
    ).toBe(false);
    expect(() => deduplicate([p, { ...p, saleEndsAt: '2026-10-02T10:00:00Z' }])).toThrow(
      'CONFLICTING_DUPLICATE',
    );
  });
});
