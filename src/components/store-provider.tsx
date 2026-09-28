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
import Image from 'next/image';
import { FAVORITES_KEY, FAVORITES_LIMIT, readFavorites } from '@/lib/favorites';
import { ArrowUpRight, Check, ShoppingBag, Trash2, X } from 'lucide-react';
import {
  addToCart,
  changeCartSize,
  cartItemKey,
  CART_KEY,
  readCart,
  writeCart,
  type CartItem,
} from '@/lib/cart';
import type { Product } from '@/lib/types';
import { localSizeLabel } from '@/lib/size-guide';
import { formatKzt } from '@/lib/money';
import { orderPhone, orderPhoneLabel } from '@/lib/store-contact';
type Store = {
  items: CartItem[];
  favorites: string[];
  favoritesReady: boolean;
  toggleFavorite: (id: string) => void;
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
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteStorageError, setFavoriteStorageError] = useState(false);
  const [currentProducts, setCurrentProducts] = useState<Product[]>([]);
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
    try {
      setFavorites(readFavorites(localStorage));
    } catch {
      setFavoriteStorageError(true);
    }
    setReady(true);
    const sync = (e: StorageEvent) => {
      if (e.key === FAVORITES_KEY || e.key === null) {
        try {
          setFavorites(readFavorites(localStorage));
        } catch {
          setFavoriteStorageError(true);
        }
      }
      if (e.key === CART_KEY || e.key === null) {
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
    if (!ready) return;
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
      setFavoriteStorageError(false);
    } catch {
      setFavoriteStorageError(true);
    }
  }, [favorites, ready]);
  function toggleFavorite(id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) return;
    if (!favorites.includes(id) && favorites.length >= FAVORITES_LIMIT) {
      setToast('В избранном уже 50 товаров. Убери один, чтобы сохранить новый.');
      return;
    }
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id].slice(0, FAVORITES_LIMIT),
    );
  }
  function resizeItem(key: string, product: Product, size: string) {
    setItems((prev) => changeCartSize(prev, key, product, size));
    setChecked((prev) => ({ ...prev, [cartItemKey({ id: product.id, size })]: true }));
    setOrderError('');
  }
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timer);
  }, [toast]);
  const add = useCallback((product: Product, size: string) => {
    setItems((prev) => addToCart(prev, product, size));
    setToast('Товар добавлен в корзину');
  }, []);
  async function openCart() {
    setOrderError('');
    dialog.current?.showModal();
    setChecked({});
    setCurrentProducts([]);
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
      setCurrentProducts(products);
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
            ? {
                ...i,
                saleKzt: p.sizePrices?.find((v) => v.size === i.size)?.saleKzt ?? p.saleKzt,
                productUrl: '',
                updatedAt: p.updatedAt,
                brand: p.brand,
                gender: p.gender,
                department: p.department,
                name: p.name,
                imageUrl: p.imageUrl,
              }
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
      if (url.origin !== 'https://wa.me' || url.pathname !== `/${orderPhone}`)
        throw new Error('Не удалось открыть WhatsApp.');
      window.location.assign(url.href);
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : 'Не удалось открыть WhatsApp.');
    } finally {
      setOrdering(false);
    }
  }
  return (
    <Context.Provider
      value={{ items, add, openCart, favorites, favoritesReady: ready, toggleFavorite }}
    >
      {children}
      {favoriteStorageError && (
        <p className="favorite-storage-warning" role="alert">
          Браузер не разрешил сохранить избранное. После перезагрузки оно может исчезнуть.
        </p>
      )}
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
            Всё для твоего следующего образа. Проверь размеры — список товаров и цены отправим в
            WhatsApp.
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
              <h3>Твоя находка ещё впереди</h3>
              <p>Добавляй кроссовки и одежду из каталога — они будут ждать здесь.</p>
              <button className="button dark" onClick={() => dialog.current?.close()}>
                Вернуться к выбору
              </button>
            </div>
          ) : (
            <>
              <div className="cart-items">
                {items.map((item) => {
                  const product = currentProducts.find((p) => p.id === item.id);
                  return (
                    <article className="cart-item" key={cartItemKey(item)}>
                      <div className="cart-thumbnail">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt={item.name}
                            fill
                            sizes="100px"
                            onError={(e) => {
                              e.currentTarget.style.visibility = 'hidden';
                            }}
                          />
                        ) : (
                          <ShoppingBag size={28} />
                        )}
                      </div>
                      <div className="cart-item-info">
                        <span className="eyebrow">
                          {item.brand}
                          {item.demo ? ' · ДЕМО' : ''}
                        </span>
                        <h3>{item.name}</h3>
                        {product?.sizes.length ? (
                          <label className="cart-size-label">
                            Размер
                            <select
                              aria-label={`Размер в корзине: ${item.name}`}
                              value={item.size}
                              disabled={checking || ordering}
                              onChange={(e) =>
                                resizeItem(cartItemKey(item), product, e.target.value)
                              }
                            >
                              {!product.sizes.includes(item.size) && (
                                <option value={item.size}>
                                  {localSizeLabel(item, item.size)} · недоступен
                                </option>
                              )}
                              {product.sizes.map((size) => (
                                <option key={size} value={size}>
                                  {localSizeLabel(product, size)} ·{' '}
                                  {formatKzt(
                                    product.sizePrices?.find((v) => v.size === size)?.saleKzt ??
                                      product.saleKzt,
                                  )}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <p>
                            {item.size
                              ? `Размер ${localSizeLabel(item, item.size)}`
                              : 'Размер не выбран'}
                          </p>
                        )}
                        <strong>{formatKzt(item.saleKzt)}</strong>
                        {!item.demo && checked[cartItemKey(item)] === false && (
                          <p className="error-text">Предложение или размер больше не доступны.</p>
                        )}
                        {item.demo ? (
                          <span className="demo-cart-note">Демонстрация, покупка недоступна</span>
                        ) : null}
                      </div>
                      <button
                        className="icon-button remove-button"
                        disabled={ordering}
                        onClick={() =>
                          setItems((prev) =>
                            prev.filter((i) => cartItemKey(i) !== cartItemKey(item)),
                          )
                        }
                        aria-label={`Удалить ${item.name}`}
                      >
                        <Trash2 size={19} />
                      </button>
                    </article>
                  );
                })}
              </div>
              <div className="cart-checkout-panel">
                <div className="cart-total">
                  <span>
                    Ориентировочная сумма{items.some((i) => i.demo) ? ' · включая демо' : ''}
                  </span>
                  <strong>{formatKzt(items.reduce((s, i) => s + i.saleKzt, 0))}</strong>
                </div>
                <p className="small muted">
                  Условия доставки и окончательную сумму согласуем в переписке.
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
                  {ordering ? 'Готовим заказ…' : 'Отправить заказ в WhatsApp'}{' '}
                  <ArrowUpRight size={18} />
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
                  Откроется WhatsApp на номер {orderPhoneLabel}. Проверьте список и нажмите
                  «Отправить» в чате. На сайте деньги не списываются.
                </p>
              </div>
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
