import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { uniqloName, uniqloSizeLabel } from '../src/lib/uniqlo-labels.mjs';
import {
  parseWhatsappOrder,
  procurementQuery,
  readProcurementQuery,
  matchesProcurement,
} from '../src/lib/procurement';
import { procurementArchive } from '../scripts/procurement-archive.mjs';
import {
  issueOwnerSession,
  ownerSession,
  ownerAttempt,
  OWNER_SESSION_SECONDS,
} from '../src/lib/server/owner-auth';
import { demoProducts } from '../src/lib/demo';
import type { AdminEntry } from '../src/lib/procurement';
const state = vi.hoisted(() => ({ allowed: false, entries: [] as unknown[] }));
vi.mock('../src/lib/server/admin-access', () => ({
  requireAdmin: async () => {
    if (!state.allowed) {
      const { AuthError } = await import('../src/lib/server/auth');
      throw new AuthError(401, 'Войдите');
    }
    return { username: 'test-owner' };
  },
}));
vi.mock('../src/lib/server/github-catalog', () => ({ githubProcurement: () => state.entries }));
import { GET, POST } from '../src/app/api/admin/catalog/route';
const product = {
  ...demoProducts[0],
  id: 'a'.repeat(64),
  demo: false,
  brand: 'Uniqlo',
  department: 'casual' as const,
  market: 'JP' as const,
  sourceId: 'uniqlo-jp',
  sourceName: 'Uniqlo JP',
  name: 'Пиджак Uniqlo',
  usage: 'ストレッチウールジャケット',
  sku: 'E445012-001-00',
  productUrl: 'https://www.uniqlo.com/jp/ja/products/E445012-001/00?colorDisplayCode=09',
  sizes: ['サイズ56(3XL)'],
};
const entry: AdminEntry = {
  product,
  selling: product,
  hidden: false,
  stale: false,
  archived: false,
};
beforeEach(() => {
  state.allowed = false;
  state.entries = [entry];
});
afterEach(() => vi.unstubAllEnvs());
describe('точные типы Uniqlo', () => {
  it.each([
    ['ストレッチウールジャケット', 'Пиджак'],
    ['感動ジャケット/カスタムオーダー/XXLサイズ', 'Пиджак'],
    ['リネンコットンジャケット', 'Пиджак'],
    ['GIRLS デニムミニスコート', 'Юбка-шорты'],
    ['GIRLS유틸리티미니스코츠', 'Юбка-шорты'],
    ['ステンカラーコート', 'Пальто'],
    ['絵本コレクション パジャマ/はらぺこあおむし', 'Пижама'],
    ['BN코튼메쉬이너바디수트(반팔)', 'Боди'],
    ['박시크롭T', 'Футболка'],
    ['ジップアップショートジャケット', 'Куртка'],
  ])('%s → %s', (original, noun) => {
    expect(uniqloName(original, 'outerwear jackets').name.startsWith(noun + ' Uniqlo')).toBe(true);
  });
  it('переводит мерки, но сохраняет исходную систему размеров', () => {
    expect(uniqloName('ストレッチウールジャケット', '', '着丈79cm').name).toContain('длина 79 см');
    expect(uniqloSizeLabel('サイズ56(3XL)')).toBe('56(3XL)');
    expect(uniqloSizeLabel('110(4-5세)')).toBe('110(4-5 лет)');
  });
});
it('находит артикул, исходное название и код; читает позиции и размеры WhatsApp', () => {
  expect(matchesProcurement(entry, '445012')).toBe(true);
  expect(matchesProcurement(entry, 'Uniqlo пиджак')).toBe(true);
  expect(matchesProcurement(entry, product.id)).toBe(true);
  const text = `1. Uniqlo — Пиджак\nРазмер: 56(3XL) · 1 шт.\nЦена: 26000 ₸\nКод товара: ${product.id}\n\n2. Та же модель\nРазмер: M · 1 шт.\nКод товара: ${product.id}`;
  expect(parseWhatsappOrder(text)).toEqual([
    { id: product.id, size: '56(3XL)' },
    { id: product.id, size: 'M' },
  ]);
  const selection = [{ id: product.id, size: 'サイズ56(3XL)' }];
  expect(readProcurementQuery(procurementQuery(selection))).toEqual(selection);
  expect(() => readProcurementQuery('javascript:alert(1)')).toThrow();
  expect(() => parseWhatsappOrder('Купите за меня всё')).toThrow();
});
it('доступ к ссылкам на поставщиков требует администратора', async () => {
  let r = await GET(new NextRequest('https://steppe.test/api/admin/catalog'));
  expect(r.status).toBe(401);
  expect(await r.text()).not.toContain('uniqlo.com');
  state.allowed = true;
  r = await GET(new NextRequest('https://steppe.test/api/admin/catalog?q=445012'));
  const body = await r.json();
  expect(body.total).toBe(1);
  expect(body.products[0].product.productUrl).toBe(product.productUrl);
  r = await POST(
    new NextRequest('https://steppe.test/api/admin/catalog', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://steppe.test' },
      body: JSON.stringify({
        items: [
          { id: product.id, size: '56(3XL)' },
          { id: 'b'.repeat(64), size: 'M' },
        ],
      }),
    }),
  );
  const order = await r.json();
  expect(order.items[0].size).toBe('サイズ56(3XL)');
  expect(order.items[1].entry).toBeNull();
});
it('сохраняет исчезнувшие товары в архиве, но не дублирует актуальные и не держит старше 90 дней', () => {
  const now = Date.now();
  const p = {
    ...product,
    updatedAt: new Date(now).toISOString(),
    sourceUpdatedAt: new Date(now).toISOString(),
  };
  expect(procurementArchive({ products: [p] }, [], now)).toHaveLength(1);
  expect(procurementArchive({ products: [p], archivedProducts: [p] }, [p], now)).toEqual([]);
  expect(procurementArchive({ products: [p] }, [], now + 91 * 86400000)).toEqual([]);
});
it('сессия владельца защищена подписью, сроком и сменой пароля; попытки ограничены', () => {
  vi.stubEnv('OWNER_ADMIN_USERNAME', 'test_owner');
  vi.stubEnv('OWNER_ADMIN_PASSWORD_HASH', `scrypt$${'a'.repeat(32)}$${'b'.repeat(128)}`);
  vi.stubEnv('OWNER_ADMIN_SESSION_SECRET', 'test-only-'.repeat(8));
  const now = Date.now(),
    token = issueOwnerSession(now);
  expect(ownerSession(token, now)).toEqual({ username: 'test_owner' });
  expect(ownerSession(token + 'x', now)).toBeNull();
  expect(ownerSession(token, now + OWNER_SESSION_SECONDS * 1000)).toBeNull();
  const parts = token.split('.');
  parts[2] = Buffer.from('{"sub":"attacker"}').toString('base64url');
  expect(ownerSession(parts.join('.'), now)).toBeNull();
  vi.stubEnv('OWNER_ADMIN_PASSWORD_HASH', `scrypt$${'a'.repeat(32)}$${'c'.repeat(128)}`);
  expect(ownerSession(token, now)).toBeNull();
  for (let i = 0; i < 8; i++) expect(ownerAttempt('test-ip', now)).toBe(true);
  expect(ownerAttempt('test-ip', now)).toBe(false);
  expect(ownerAttempt('test-ip', now + 16 * 60000)).toBe(true);
});
