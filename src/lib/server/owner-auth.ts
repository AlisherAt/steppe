import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
export const OWNER_SESSION_SECONDS = 8 * 60 * 60;
export function ownerConfigured() {
  return (
    /^[a-z0-9_]{3,32}$/.test(process.env.OWNER_ADMIN_USERNAME || '') &&
    /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(process.env.OWNER_ADMIN_PASSWORD_HASH || '') &&
    (process.env.OWNER_ADMIN_SESSION_SECRET || '').length >= 32
  );
}
function key() {
  return createHmac('sha256', process.env.OWNER_ADMIN_SESSION_SECRET!)
    .update(process.env.OWNER_ADMIN_PASSWORD_HASH!)
    .digest();
}
export function issueOwnerSession(now = Date.now()) {
  if (!ownerConfigured()) throw Error('OWNER_NOT_CONFIGURED');
  const data = Buffer.from(
    JSON.stringify({
      sub: process.env.OWNER_ADMIN_USERNAME,
      aud: 'steppe-owner',
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + OWNER_SESSION_SECONDS,
      nonce: randomBytes(16).toString('hex'),
    }),
  ).toString('base64url');
  return `owner.v1.${data}.${createHmac('sha256', key()).update(data).digest('base64url')}`;
}
export function ownerSession(token?: string, now = Date.now()): { username: string } | null {
  if (!ownerConfigured() || !token || token.length > 1000) return null;
  const match = /^owner\.v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  try {
    const expected = createHmac('sha256', key()).update(match[1]).digest(),
      signature = Buffer.from(match[2], 'base64url');
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
    const data = JSON.parse(Buffer.from(match[1], 'base64url').toString());
    const seconds = Math.floor(now / 1000);
    if (
      data.aud !== 'steppe-owner' ||
      data.sub !== process.env.OWNER_ADMIN_USERNAME ||
      !Number.isInteger(data.iat) ||
      !Number.isInteger(data.exp) ||
      data.iat > seconds + 60 ||
      data.exp <= seconds ||
      data.exp - data.iat !== OWNER_SESSION_SECONDS
    )
      return null;
    return { username: data.sub };
  } catch {
    return null;
  }
}
const attempts = new Map<string, { count: number; until: number }>();
export function ownerAttempt(ip: string, now = Date.now()) {
  for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
  const key = createHash('sha256').update(ip).digest('hex');
  const value = attempts.get(key) || { count: 0, until: now + 15 * 60000 };
  if (value.count >= 8 || (!attempts.has(key) && attempts.size >= 1024)) return false;
  value.count++;
  attempts.set(key, value);
  return true;
}
