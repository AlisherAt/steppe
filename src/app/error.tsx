'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="page-content empty-state">
      <h1>Не удалось открыть страницу</h1>
      <p>Попробуйте ещё раз через несколько секунд.</p>
      <button className="button dark" onClick={reset}>
        Повторить
      </button>
    </main>
  );
}
