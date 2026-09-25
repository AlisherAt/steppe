import type { NextRequest } from 'next/server';
import { auth, AuthError } from './auth';
import { seaClient } from './seatable-client';

export async function administrator(username: string) {
  const users = (await seaClient.rows('STEPPE_Users')).filter((r) => r.username === username);
  if (users.length !== 1) return null;
  const roles = await seaClient.rows('STEPPE_Admins');
  return roles.some((r) => r.user_id === users[0].id) ? String(users[0].id) : null;
}

export async function requireAdmin(req: NextRequest, write = false) {
  if (
    write &&
    (req.headers.get('origin') !== req.nextUrl.origin ||
      !req.headers.get('content-type')?.startsWith('application/json'))
  )
    throw new AuthError(403, 'Недопустимый запрос.');
  const cookie = process.env.NODE_ENV === 'production' ? '__Host-steppe_session' : 'steppe_session';
  const user = await auth.user(req.cookies.get(cookie)?.value);
  if (!user) throw new AuthError(401, 'Войдите в аккаунт администратора.');
  const id = await administrator(user.username);
  if (!id) throw new AuthError(403, 'Этот аккаунт не имеет прав администратора.');
  return { id, username: user.username };
}
