import Link from 'next/link';
export default function NotFound() {
  return (
    <main id="main-content" className="page-content empty-state">
      <span className="eyebrow">404</span>
      <h1>Здесь пока нет пары</h1>
      <p>Такой страницы не существует.</p>
      <Link className="button dark" href="/">
        Вернуться в каталог
      </Link>
    </main>
  );
}
