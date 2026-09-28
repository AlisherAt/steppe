'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart, ArrowUpRight } from 'lucide-react';
import { useStore } from './store-provider';
import { ProductCard } from './product-card';
import type { Product } from '@/lib/types';
export function Favorites() {
  const { favorites, favoritesReady, toggleFavorite } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const key = favorites.join(',');
  useEffect(() => {
    if (!favoritesReady) return;
    if (!key) {
      setProducts([]);
      setLoading(false);
      setError(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    fetch('/api/cart-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: key.split(',') }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => {
        setProducts(data.products);
        setLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(true);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [key, favoritesReady, retry]);
  const missing = favorites.filter((id) => !products.some((p) => p.id === id));
  return (
    <main id="main-content" className="saved-page storefront">
      <div className="saved-heading">
        <span className="eyebrow">ТВОЯ ЛИЧНАЯ ПОДБОРКА</span>
        <h1>
          Нравится? Сохрани<span>.</span>
        </h1>
        <p>Кроссовки и одежда, к которым хочется вернуться. Избранное хранится в этом браузере.</p>
      </div>
      {!favoritesReady || loading ? (
        <p role="status">Проверяем твои находки…</p>
      ) : error ? (
        <div className="empty-state" role="alert">
          <h2>Не удалось загрузить избранное</h2>
          <p>Твой список сохранён. Попробуй ещё раз.</p>
          <button className="button dark" onClick={() => setRetry((v) => v + 1)}>
            Повторить
          </button>
        </div>
      ) : !favorites.length ? (
        <div className="empty-state">
          <Heart size={40} />
          <h2>Собери свою подборку</h2>
          <p>Нажимай сердечко на понравившихся вещах.</p>
          <Link href="/" className="button dark">
            Начать с кроссовок <ArrowUpRight size={18} />
          </Link>
        </div>
      ) : (
        <>
          {missing.length > 0 && (
            <div className="notice">
              Сейчас недоступно товаров: {missing.length}. Они останутся в избранном на случай
              возвращения в каталог.{' '}
              <button className="text-link" onClick={() => missing.forEach(toggleFavorite)}>
                Убрать недоступные
              </button>
            </div>
          )}
          <div className="product-grid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
