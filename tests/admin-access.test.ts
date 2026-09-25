import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const state = vi.hoisted(() => ({
  user: null as null | { username: string },
  role: false,
  reads: 0,
}));
vi.mock('../src/lib/server/auth', () => ({
  auth: { user: async () => state.user },
  AuthError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock('../src/lib/server/seatable-client', () => ({
  seaClient: {
    rows: async (name: string) => {
      state.reads++;
      if (name === 'STEPPE_Users') return [{ id: 'immutable-user-id', username: 'owner' }];
      if (name === 'STEPPE_Admins') return state.role ? [{ user_id: 'immutable-user-id' }] : [];
      return [];
    },
  },
}));
import { requireAdmin } from '../src/lib/server/admin-access';
beforeEach(() => {
  state.user = null;
  state.role = false;
  state.reads = 0;
});
const request = (origin = 'https://steppe.test') =>
  new NextRequest('https://steppe.test/api/admin/products', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
  });
it('rejects anonymous visitors and ordinary registered accounts', async () => {
  await expect(requireAdmin(request(), true)).rejects.toMatchObject({ status: 401 });
  expect(state.reads).toBe(0);
  state.user = { username: 'owner' };
  await expect(requireAdmin(request(), true)).rejects.toMatchObject({ status: 403 });
});
it('requires a server-side role and same-origin writes', async () => {
  state.user = { username: 'owner' };
  state.role = true;
  await expect(requireAdmin(request('https://attacker.test'), true)).rejects.toMatchObject({
    status: 403,
  });
  expect(state.reads).toBe(0);
  expect(await requireAdmin(request(), true)).toEqual({
    id: 'immutable-user-id',
    username: 'owner',
  });
});
