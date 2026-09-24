'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, ShoppingBag, MapPin } from 'lucide-react';
import { useStore } from './store-provider';
export function Header() {
  const { items, openCart } = useStore();
  const pathname = usePathname();
  return (
    <>
      <div className="topline">
        <span>Хорошие кроссовки. Хорошая цена.</span>
        <span>
          Покупай у магазинов <ArrowUpRight size={13} />
        </span>
      </div>
      <header className="header">
        <Link href="/" className="wordmark" aria-label="STEPPE — главная">
          STEPPE<span className="brand-star">✳</span>
          <span className="wordmark-dot">.</span>
        </Link>
        <nav aria-label="Основная навигация">
          <Link href="/" aria-current={pathname === '/' ? 'page' : undefined}>
            Все скидки
          </Link>
          <Link href="/sources" aria-current={pathname === '/sources' ? 'page' : undefined}>
            Магазины
          </Link>
          <Link href="/brands" aria-current={pathname === '/brands' ? 'page' : undefined}>
            Бренды
          </Link>
          <Link href="/about" aria-current={pathname === '/about' ? 'page' : undefined}>
            Как это работает
          </Link>
        </nav>
        <div className="header-right">
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
    </>
  );
}
