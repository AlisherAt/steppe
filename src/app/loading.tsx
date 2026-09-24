export default function Loading() {
  return (
    <main id="main-content" className="page-content" aria-busy="true">
      <p role="status">Загружаем находки…</p>
      <div className="product-grid">
        {[1, 2, 3].map((i) => (
          <div className="skeleton-card" key={i} />
        ))}
      </div>
    </main>
  );
}
