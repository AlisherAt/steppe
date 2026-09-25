import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AuthError } from './auth';
import { ZodError } from 'zod';
export const adminJson = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' },
  });
export async function adminBody(req: NextRequest) {
  if (Number(req.headers.get('content-length')) > 20000)
    throw new AuthError(413, 'Слишком большой запрос.');
  const text = await req.text();
  if (text.length > 20000) throw new AuthError(413, 'Слишком большой запрос.');
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
    return value;
  } catch {
    throw new AuthError(400, 'Некорректный запрос.');
  }
}
export function adminError(error: unknown) {
  if (error instanceof AuthError) return adminJson({ error: error.message }, error.status);
  if (error instanceof ZodError)
    return adminJson({ error: 'Проверьте поля товара и выбранные размеры.' }, 400);
  console.error('admin_operation_failed');
  return adminJson({ error: 'Не удалось выполнить действие. Попробуйте позже.' }, 503);
}
