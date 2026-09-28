'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, ShoppingBag, MapPin, Heart, Footprints, Shirt } from 'lucide-react';
import { useStore } from './store-provider';
export function Header() {
  const { items, openCart, favorites } = useStore();
  const pathname = usePathname();
  return (
    <>
      <div className="topline">
        <span>Твой стиль. Хорошая цена.</span>
        <span>
          Заказывай в WhatsApp <ArrowUpRight size={13} />
        </span>
      </div>
      <header className="header">
        <Link href="/" className="wordmark" aria-label="STEPPE — главная">
          STEPPE<span className="brand-star">✳</span>
          <span className="wordmark-dot">.</span>
        </Link>
        <nav aria-label="Основная навигация">
          <Link href="/" aria-current={pathname === '/' ? 'page' : undefined}>
            Кроссовки
          </Link>
          <Link
            href="/clothing"
            aria-current={pathname.startsWith('/clothing') ? 'page' : undefined}
          >
            Одежда
          </Link>
        </nav>
        <div className="header-right">
          <Link
            href="/favorites"
            className="header-favorites"
            aria-label={`Избранное, товаров: ${favorites.length}`}
          >
            <Heart size={20} />
            <span>Избранное</span>
            {favorites.length > 0 && <b>{favorites.length}</b>}
          </Link>
          <Link href="/login" className="account-link">
            Аккаунт
          </Link>
          <span className="location">
            <MapPin size={16} /> Казахстан · ₸
          </span>
          <button
            className="cart-button"
            onClick={openCart}
            aria-label={`Открыть корзину, товаров: ${items.length}`}
          >
            <ShoppingBag size={20} />
            <span className="cart-label">Корзина</span>
            <span className="cart-count">{items.length}</span>
          </button>
        </div>
      </header>
      <nav className="mobile-bottom-nav" aria-label="Быстрая навигация">
        <Link href="/" aria-current={pathname === '/' ? 'page' : undefined}>
          <Footprints size={21} />
          <span>Кроссовки</span>
        </Link>
        <Link href="/clothing" aria-current={pathname.startsWith('/clothing') ? 'page' : undefined}>
          <Shirt size={21} />
          <span>Одежда</span>
        </Link>
        <Link href="/favorites" aria-current={pathname === '/favorites' ? 'page' : undefined}>
          <Heart size={21} />
          <span>Избранное{favorites.length ? ` · ${favorites.length}` : ''}</span>
        </Link>
        <button onClick={openCart} aria-label={`Корзина, товаров: ${items.length}`}>
          <ShoppingBag size={21} />
          <span>Корзина{items.length ? ` · ${items.length}` : ''}</span>
        </button>
      </nav>
    </>
  );
}
