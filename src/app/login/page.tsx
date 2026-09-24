'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
export default function LoginPage() {
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/auth', { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setUser(data.user);
      })
      .catch((e) => setError(e.message || 'Не удалось проверить вход.'))
      .finally(() => setLoading(false));
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    if (register && data.get('password') !== data.get('confirmation')) {
      setError('Пароли не совпадают.');
      setBusy(false);
      return;
    }
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: user ? 'logout' : register ? 'register' : 'login',
          username: data.get('username'),
          password: data.get('password'),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setUser(result.user);
      window.dispatchEvent(new Event('steppe-auth'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось связаться с сервером.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main-content" className="auth-page">
      <section className="auth-card">
        <p className="auth-eyebrow">ТВОЙ STEPPE</p>
        <h1>
          {user ? `Привет, ${user.username}` : register ? 'Создать аккаунт' : 'С возвращением'}
        </h1>
        {loading ? (
          <p role="status">Проверяем вход…</p>
        ) : (
          <>
            <p>
              {user
                ? 'Вы вошли в аккаунт. Корзина сохраняется в этом браузере.'
                : 'Сохраняй свой ритм. Находи свою пару.'}
            </p>
            <form onSubmit={submit}>
              {!user && (
                <>
                  <label>
                    Логин
                    <input
                      name="username"
                      required
                      minLength={3}
                      maxLength={32}
                      pattern="[A-Za-z0-9_]{3,32}"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      aria-describedby="login-help"
                    />
                  </label>
                  <small id="login-help">3–32 латинские буквы, цифры или знак _</small>
                  <label>
                    Пароль
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={12}
                      maxLength={128}
                      autoComplete={register ? 'new-password' : 'current-password'}
                    />
                  </label>
                  <small>Не менее 12 символов</small>
                  {register && (
                    <>
                      <label>
                        Повторите пароль
                        <input
                          name="confirmation"
                          type="password"
                          required
                          minLength={12}
                          maxLength={128}
                          autoComplete="new-password"
                        />
                      </label>
                      <small>Сохраните пароль: восстановление через почту пока недоступно.</small>
                    </>
                  )}
                </>
              )}
              {error && (
                <p role="alert" className="auth-error">
                  {error}
                </p>
              )}
              <button className="auth-submit" disabled={busy}>
                {busy
                  ? 'Подождите…'
                  : user
                    ? 'Выйти из аккаунта'
                    : register
                      ? 'Зарегистрироваться'
                      : 'Войти'}
              </button>
            </form>
            {!user && (
              <button
                className="auth-toggle"
                onClick={() => {
                  setRegister(!register);
                  setError('');
                }}
                disabled={busy}
              >
                {register ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
              </button>
            )}
            <Link href="/" className="auth-back">
              ← В каталог
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
