'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, ShoppingBag, Trash2, X } from 'lucide-react';
import { addToCart, cartItemKey, CART_KEY, readCart, writeCart, type CartItem } from '@/lib/cart';
import type { Product } from '@/lib/types';
import { formatKzt } from '@/lib/money';
type Store = {
  items: CartItem[];
  add: (product: Product, size: string) => void;
  openCart: () => void;
};
const Context = createContext<Store | null>(null);
export function useStore() {
  const store = useContext(Context);
  if (!store) throw new Error('StoreProvider missing');
  return store;
}
export function StoreProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [checkError, setCheckError] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [orderError, setOrderError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    try {
      setItems(readCart(localStorage));
    } catch {
      setStorageError(true);
    }
    setReady(true);
    const sync = (e: StorageEvent) => {
      if (e.key === CART_KEY) {
        try {
          setItems(readCart(localStorage));
        } catch {
          setStorageError(true);
        }
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        writeCart(localStorage, items);
        setStorageError(false);
      } catch {
        setStorageError(true);
      }
    }
  }, [items, ready]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timer);
  }, [toast]);
  const add = useCallback((product: Product, size: string) => {
    setItems((prev) => addToCart(prev, product, size));
    setToast('Пара добавлена в корзину');
  }, []);
  async function openCart() {
    setOrderError('');
    dialog.current?.showModal();
    setChecked({});
    setCheckError(false);
    const ids = [...new Set(items.filter((i) => !i.demo).map((i) => i.id))];
    if (!ids.length) return;
    setChecking(true);
    try {
      const response = await fetch('/api/cart-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error();
      const { products } = (await response.json()) as { products: Product[] };
      setChecked(
        Object.fromEntries(
          items
            .filter((i) => !i.demo)
            .map((i) => [
              cartItemKey(i),
              products.some((p) => p.id === i.id && (!p.sizes.length || p.sizes.includes(i.size))),
            ]),
        ),
      );
      setItems((prev) =>
        prev.map((i) => {
          const p = products.find((p) => p.id === i.id);
          return p
            ? { ...i, saleKzt: p.saleKzt, productUrl: p.productUrl, updatedAt: p.updatedAt }
            : i;
        }),
      );
    } catch {
      setCheckError(true);
    } finally {
      setChecking(false);
    }
  }
  async function checkout() {
    setOrdering(true);
    setOrderError('');
    try {
      const response = await fetch('/api/checkout/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.map(({ id, size }) => ({ id, size })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось оформить заказ.');
      const url = new URL(data.url);
      if (url.origin !== 'https://wa.me') throw new Error('Не удалось открыть WhatsApp.');
      window.location.assign(url.href);
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : 'Не удалось открыть WhatsApp.');
    } finally {
      setOrdering(false);
    }
  }
  return (
    <Context.Provider value={{ items, add, openCart }}>
      {children}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      <dialog
        className="cart-dialog"
        ref={dialog}
        aria-labelledby="cart-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className="cart-inner">
          <div className="dialog-header">
            <div>
              <span className="eyebrow">ТВОЙ ВЫБОР</span>
              <h2 id="cart-title">
                Корзина <span className="muted">{items.length}</span>
              </h2>
            </div>
            <button
              className="icon-button"
              onClick={() => dialog.current?.close()}
              aria-label="Закрыть корзину"
            >
              <X />
            </button>
          </div>
          <p className="cart-explainer">
            Собери понравившиеся пары и оформи заказ в WhatsApp. В чат подставится список товаров с
            размерами, ценами и ссылками. Условия и оплату согласуете в переписке.
          </p>
          {storageError && (
            <p role="alert" className="notice warning">
              Браузер не разрешил сохранить корзину. После перезагрузки она может исчезнуть.
            </p>
          )}
          {checking && <p role="status">Проверяем цены и наличие…</p>}
          {checkError && (
            <p role="alert" className="notice warning">
              Не удалось проверить актуальность. Закройте и откройте корзину, чтобы повторить.
            </p>
          )}
          {!items.length ? (
            <div className="cart-empty">
              <ShoppingBag size={48} strokeWidth={1} />
              <h3>Хорошая пара ещё найдётся</h3>
              <p>Добавляй кроссовки из каталога — они будут ждать здесь.</p>
              <button className="button dark" onClick={() => dialog.current?.close()}>
                Вернуться к выбору
              </button>
            </div>
          ) : (
            <>
              <div className="cart-items">
                {items.map((item) => (
                  <article className="cart-item" key={cartItemKey(item)}>
                    <div className="cart-item-info">
                      <span className="eyebrow">
                        {item.brand}
                        {item.demo ? ' · ДЕМО' : ''}
                      </span>
                      <h3>{item.name}</h3>
                      <p>
                        {item.sourceName} ·{' '}
                        {item.size ? `Размер EU ${item.size}` : 'Размер уточняйте в магазине'}
                      </p>
                      <strong>{formatKzt(item.saleKzt)}</strong>
                      {!item.demo && checked[cartItemKey(item)] === false && (
                        <p className="error-text">Предложение или размер больше не доступны.</p>
                      )}
                      {item.demo ? (
                        <span className="demo-cart-note">Демонстрация, покупка недоступна</span>
                      ) : checked[cartItemKey(item)] && !checking && !checkError ? (
                        <a
                          className="text-link"
                          href={item.productUrl}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                        >
                          Перейти в магазин <ArrowUpRight size={16} />
                        </a>
                      ) : null}
                    </div>
                    <button
                      className="icon-button remove-button"
                      disabled={ordering}
                      onClick={() =>
                        setItems((prev) => prev.filter((i) => cartItemKey(i) !== cartItemKey(item)))
                      }
                      aria-label={`Удалить ${item.name}`}
                    >
                      <Trash2 size={19} />
                    </button>
                  </article>
                ))}
              </div>
              <div className="cart-total">
                <span>
                  Ориентировочная сумма{items.some((i) => i.demo) ? ' · включая демо' : ''}
                </span>
                <strong>{formatKzt(items.reduce((s, i) => s + i.saleKzt, 0))}</strong>
              </div>
              <p className="small muted">
                Без дополнительных сборов площадки и комиссии конвертации. Окончательные условия
                уточняйте у продавца. Корзина хранится только в этом браузере.
              </p>
              <button
                className="button dark whatsapp-checkout"
                onClick={checkout}
                disabled={
                  ordering ||
                  checking ||
                  checkError ||
                  items.some((i) => i.demo || !checked[cartItemKey(i)])
                }
              >
                {ordering ? 'Готовим заказ…' : 'Оформить в WhatsApp'} <ArrowUpRight size={18} />
              </button>
              {items.some((i) => i.demo) && (
                <p className="small muted">Удалите демотовары, чтобы оформить заказ.</p>
              )}
              {orderError && (
                <p role="alert" className="error-text">
                  {orderError}
                </p>
              )}
              <p className="small muted">
                Откроется WhatsApp. Проверьте список и нажмите «Отправить» в чате. На сайте деньги
                не списываются.
              </p>
            </>
          )}
          <Link className="text-link" href="/about" onClick={() => dialog.current?.close()}>
            Как работает STEPPE <ArrowUpRight size={16} />
          </Link>
        </div>
      </dialog>
    </Context.Provider>
  );
}
