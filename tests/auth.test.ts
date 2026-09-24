import { describe, expect, it } from 'vitest';
import { AuthService, credentials, hashPassword, verifyPassword } from '../src/lib/server/auth';
import type { SeaRow, SeaTransport } from '../src/lib/server/seatable-client';
class Memory implements SeaTransport {
  data: Record<string, SeaRow[]> = {};
  async rows(t: string) {
    return (this.data[t] ||= []);
  }
  async append(t: string, rows: Record<string, unknown>[]) {
    (await this.rows(t)).push(...rows.map((r) => ({ ...r, _id: crypto.randomUUID() })));
  }
  async remove(t: string, ids: string[]) {
    this.data[t] = (await this.rows(t)).filter((r) => !ids.includes(r._id));
  }
  async update() {}
}
describe('authentication', () => {
  it('normalizes usernames and rejects weak credentials', () => {
    expect(credentials.parse({ username: ' Alice ', password: 'long-password-123' }).username).toBe(
      'alice',
    );
    expect(credentials.safeParse({ username: 'a', password: 'short' }).success).toBe(false);
  });
  it('salts passwords and rejects wrong passwords', async () => {
    const a = await hashPassword('long-password-123'),
      b = await hashPassword('long-password-123');
    expect(a).not.toBe(b);
    expect(await verifyPassword('long-password-123', a)).toBe(true);
    expect(await verifyPassword('wrong-password-123', a)).toBe(false);
    expect(await verifyPassword('long-password-123', 'broken')).toBe(false);
  });
  it('registers, logs in, revokes sessions and checks expiry', async () => {
    const db = new Memory(),
      auth = new AuthService(db);
    const first = await auth.authenticate('alice', 'long-password-123', true);
    expect(await auth.user(first.token)).toEqual({ username: 'alice' });
    expect(JSON.stringify(db.data)).not.toContain(first.token);
    expect(JSON.stringify(db.data)).not.toContain('long-password-123');
    await expect(auth.authenticate('alice', 'long-password-123', true)).rejects.toMatchObject({
      status: 409,
    });
    await expect(auth.authenticate('alice', 'wrong-password-123', false)).rejects.toMatchObject({
      status: 401,
    });
    await auth.logout(first.token);
    expect(await auth.user(first.token)).toBeNull();
    const second = await auth.authenticate('alice', 'long-password-123', false);
    db.data.STEPPE_Sessions[0].expires_at = new Date(0).toISOString();
    expect(await auth.user(second.token)).toBeNull();
  });
  it('fails closed when duplicate users exist', async () => {
    const db = new Memory(),
      auth = new AuthService(db);
    const result = await auth.authenticate('alice', 'long-password-123', true);
    await db.append('STEPPE_Users', [{ ...db.data.STEPPE_Users[0], id: 'another' }]);
    expect(await auth.user(result.token)).toBeNull();
    await expect(auth.authenticate('alice', 'long-password-123', false)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('limits attempts across service instances', async () => {
    const db = new Memory(),
      auth = new AuthService(db);
    for (let i = 0; i < 8; i++) await auth.attempt('alice', 'ip');
    await expect(new AuthService(db).attempt('alice', 'other-ip')).rejects.toMatchObject({
      status: 429,
    });
  });
});
