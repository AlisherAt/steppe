import { NextRequest, NextResponse } from 'next/server';
import { auth, AuthError, credentials } from '@/lib/server/auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const cookie = process.env.NODE_ENV === 'production' ? '__Host-steppe_session' : 'steppe_session';
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(req: NextRequest) {
  try {
    return json({ user: await auth.user(req.cookies.get(cookie)?.value) });
  } catch {
    return json({ error: 'Вход временно недоступен. Попробуйте позже.' }, 503);
  }
}
export async function POST(req: NextRequest) {
  if (
    req.headers.get('origin') !== req.nextUrl.origin ||
    !req.headers.get('content-type')?.startsWith('application/json')
  )
    return json({ error: 'Недопустимый запрос.' }, 403);
  try {
    const raw = await req.text();
    if (raw.length > 2048) return json({ error: 'Слишком длинный запрос.' }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'Некорректный запрос.' }, 400);
    }
    if (!body || !['login', 'register', 'logout'].includes(body.action))
      return json({ error: 'Некорректный запрос.' }, 400);
    if (body.action === 'logout') {
      await auth.logout(req.cookies.get(cookie)?.value);
      const res = json({ user: null });
      res.cookies.set(cookie, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
      return res;
    }
    const parsed = credentials.safeParse(body);
    if (!parsed.success)
      return json(
        { error: 'Логин: 3–32 латинские буквы, цифры или _. Пароль: 12–128 символов.' },
        400,
      );
    // Vercel overwrites x-vercel-forwarded-for; do not trust arbitrary x-forwarded-for.
    const ip = process.env.VERCEL
      ? req.headers.get('x-vercel-forwarded-for') || 'unknown'
      : 'local';
    await auth.attempt(parsed.data.username, ip);
    const result = await auth.authenticate(
      parsed.data.username,
      parsed.data.password,
      body.action === 'register',
    );
    await auth.logout(req.cookies.get(cookie)?.value);
    const res = json({ user: result.user });
    res.cookies.set(cookie, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 86400,
    });
    return res;
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    console.error('auth_request_failed');
    return json({ error: 'Вход временно недоступен. Попробуйте позже.' }, 503);
  }
}
