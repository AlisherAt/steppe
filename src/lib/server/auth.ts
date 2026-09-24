import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import { seaClient, type SeaTransport } from './seatable-client';
const derive = (
  password: string,
  salt: string,
  length: number,
  options: { N: number; r: number; p: number; maxmem: number },
) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, length, options, (error, key) => (error ? reject(error) : resolve(key))),
  );
export const credentials = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,32}$/),
  password: z.string().min(12).max(128),
});
export const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await derive(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 3,
    maxmem: 64 * 1024 * 1024,
  })) as Buffer;
  return `scrypt$${salt}$${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const parts = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded);
  const salt = parts?.[1] || '0'.repeat(32);
  const hash = (await derive(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 3,
    maxmem: 64 * 1024 * 1024,
  })) as Buffer;
  return timingSafeEqual(hash, Buffer.from(parts?.[2] || '0'.repeat(128), 'hex')) && !!parts;
}
export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class AuthService {
  constructor(private db: SeaTransport = seaClient) {}
  async attempt(username: string, ip: string) {
    const now = Date.now();
    const rows = await this.db.rows('STEPPE_AuthAttempts');
    const recent = rows.filter((r) => Date.parse(String(r.created_at)) > now - 15 * 60_000);
    const account = digest(username),
      address = digest(ip);
    if (
      recent.filter((r) => r.account_hash === account).length >= 8 ||
      recent.filter((r) => r.ip_hash === address).length >= 30
    )
      throw new AuthError(429, 'Слишком много попыток. Попробуйте через 15 минут.');
    await this.db.append('STEPPE_AuthAttempts', [
      { account_hash: account, ip_hash: address, created_at: new Date(now).toISOString() },
    ]);
    const old = rows.filter((r) => Date.parse(String(r.created_at)) <= now - 15 * 60_000);
    if (old.length)
      await this.db.remove(
        'STEPPE_AuthAttempts',
        old.map((r) => r._id),
      );
  }
  async authenticate(username: string, password: string, register: boolean) {
    let users = (await this.db.rows('STEPPE_Users')).filter((r) => r.username === username);
    if (register) {
      if (users.length) throw new AuthError(409, 'Этот логин недоступен. Выберите другой.');
      const id = randomBytes(24).toString('hex');
      await this.db.append('STEPPE_Users', [
        {
          id,
          username,
          password_hash: await hashPassword(password),
          created_at: new Date().toISOString(),
        },
      ]);
      users = (await this.db.rows('STEPPE_Users')).filter((r) => r.username === username);
      if (users.length !== 1 || users[0].id !== id)
        throw new AuthError(409, 'Этот логин недоступен. Выберите другой.');
    }
    const valid = await verifyPassword(
      password,
      users.length === 1 ? String(users[0].password_hash) : '',
    );
    if (!valid || users.length !== 1) throw new AuthError(401, 'Неверный логин или пароль.');
    const token = randomBytes(32).toString('hex');
    const sessions = await this.db.rows('STEPPE_Sessions');
    const expired = sessions.filter((r) => Date.parse(String(r.expires_at)) <= Date.now());
    if (expired.length)
      await this.db.remove(
        'STEPPE_Sessions',
        expired.map((r) => r._id),
      );
    await this.db.append('STEPPE_Sessions', [
      {
        token_hash: digest(token),
        user_id: users[0].id,
        expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
      },
    ]);
    return { token, user: { username } };
  }
  async user(token?: string) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const sessions = (await this.db.rows('STEPPE_Sessions')).filter(
      (r) => r.token_hash === digest(token) && Date.parse(String(r.expires_at)) > Date.now(),
    );
    if (sessions.length !== 1) return null;
    const all = await this.db.rows('STEPPE_Users');
    const user = all.find((r) => r.id === sessions[0].user_id);
    if (!user || all.filter((r) => r.username === user.username).length !== 1) return null;
    return { username: String(user.username) };
  }
  async logout(token?: string) {
    if (!token) return;
    const rows = (await this.db.rows('STEPPE_Sessions')).filter(
      (r) => r.token_hash === digest(token),
    );
    if (rows.length)
      await this.db.remove(
        'STEPPE_Sessions',
        rows.map((r) => r._id),
      );
  }
}
export const auth = new AuthService();
