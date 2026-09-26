import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ content: '' }));
vi.mock('node:fs/promises', () => ({
  readdir: async () => ['nike-us.json', 'overrides.json', '.env.local'],
  readFile: async () => state.content,
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it('публикует только файл источника, повторяет конфликт без force и сохраняет остальные файлы', async () => {
  vi.resetModules();
  vi.stubEnv('GITHUB_TOKEN', 'test-token');
  const now = new Date().toISOString();
  state.content = JSON.stringify({
    version: 1,
    sourceId: 'nike-us',
    checkedAt: now,
    generatedAt: now,
    runId: 'new',
    products: [{ sourceId: 'nike-us', demo: false }],
  });
  const originalArgs = process.argv;
  process.argv = ['node', 'publish-catalog.mjs', 'test-directory'];
  let patches = 0;
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const path = url.split('/steppe/')[1];
    if (path === 'git/ref/heads/main')
      return Response.json({ object: { sha: patches ? 'parent2' : 'parent1' } });
    if (path.startsWith('git/commits/') && init.method === 'GET')
      return Response.json({ tree: { sha: 'base' } });
    if (path.startsWith('git/trees/base'))
      return Response.json({ tree: [{ path: 'data/catalog/nike-us.json', sha: 'old' }] });
    if (path === 'git/blobs/old')
      return Response.json({
        content: Buffer.from(JSON.stringify({ checkedAt: '2026-01-01T00:00:00Z' })).toString(
          'base64',
        ),
      });
    if (path === 'git/trees') {
      const body = JSON.parse(String(init.body));
      expect(body.base_tree).toBe('base');
      expect(body.tree.map((f: { path: string }) => f.path)).toEqual(['data/catalog/nike-us.json']);
      return Response.json({ sha: 'new-tree' });
    }
    if (path === 'git/commits') {
      expect(JSON.parse(String(init.body)).parents).toEqual([patches ? 'parent2' : 'parent1']);
      return Response.json({ sha: 'new-commit' });
    }
    if (path === 'git/refs/heads/main') {
      expect(JSON.parse(String(init.body)).force).toBe(false);
      patches++;
      return Response.json({}, { status: patches === 1 ? 422 : 200 });
    }
    throw Error(`UNEXPECTED_REQUEST_${path}`);
  });
  vi.stubGlobal('fetch', fetch);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await import('../scripts/publish-catalog.mjs');
  } finally {
    process.argv = originalArgs;
  }
  expect(patches).toBe(2);
});
