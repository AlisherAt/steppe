'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Plus, X, Check, Heart, ArrowUpRight } from 'lucide-react';
import type { Product } from '@/lib/types';
import { localSizeKey, localSizeLabel } from '@/lib/size-guide';
import { formatKzt, formatDate, discountPercent } from '@/lib/money';
import { useStore } from './store-provider';
import { productDescription } from '@/lib/product-description';
import { SizeGuide } from './size-guide';
import { ProductGallery } from './product-gallery';
const genders = { men: 'Мужские', women: 'Женские', unisex: 'Унисекс', kids: 'Детские' };
export function ProductCard({
  product: p,
  priority = false,
}: {
  product: Product;
  priority?: boolean;
}) {
  const [size, setSize] = useState('');
  const [error, setError] = useState('');
  const [detailsOpened, setDetailsOpened] = useState(false);
  const [added, setAdded] = useState(false);
  const details = useRef<HTMLDialogElement>(null);
  const id = useId();
  const { add, favorites, toggleFavorite, openCart } = useStore();
  const favorite = favorites.includes(p.id);
  const clothing = Boolean(p.department && p.department !== 'sneakers');
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 2000);
    return () => clearTimeout(timer);
  }, [added]);
  useEffect(() => {
    if (size && !p.sizes.includes(size)) setSize('');
  }, [p.sizes, size]);
  function openDetails() {
    setDetailsOpened(true);
    details.current?.showModal();
  }
  const description = productDescription(p);
  const selectedPrice = p.sizePrices?.find((v) => v.size === size)?.saleKzt ?? p.saleKzt;
  const discount =
    p.originalKzt !== null && p.originalKzt > selectedPrice
      ? discountPercent(String(p.originalKzt), String(selectedPrice))
      : 0;
  const pricePrefix = !size && new Set(p.sizePrices?.map((v) => v.saleKzt)).size > 1 ? 'от ' : '';
  const prices = (
    <div className="product-prices">
      <strong>
        {pricePrefix}
        {formatKzt(selectedPrice)}
      </strong>
      {p.originalKzt !== null && p.originalKzt > selectedPrice && (
        <del>{formatKzt(p.originalKzt)}</del>
      )}
    </div>
  );
  function choose(value: string) {
    setSize(value);
    setError('');
    setAdded(false);
  }
  function save() {
    if (!size || !p.sizes.includes(size)) {
      setError('Выбери доступный размер');
      return;
    }
    add(p, size);
    setAdded(true);
    setError('');
  }
  return (
    <article className={`product-card ${clothing ? 'clothing-card' : 'sneaker-card'}`}>
      <ProductGallery product={p} priority={priority} onOpen={openDetails}>
        {discount > 0 ? (
          <span className="discount-badge">−{discount}%</span>
        ) : p.discountVerified ? (
          <span className="discount-badge">Скидка</span>
        ) : null}
        {p.demo && <span className="demo-badge">ДЕМО</span>}
        {!p.demo && (
          <button
            className="favorite-button"
            onClick={() => toggleFavorite(p.id)}
            aria-label={`${favorite ? 'Убрать из избранного' : 'В избранное'}: ${p.name}`}
            aria-pressed={favorite}
          >
            <Heart size={19} fill={favorite ? 'currentColor' : 'none'} />
          </button>
        )}
      </ProductGallery>
      <div className="product-info">
        <div className="product-meta">
          <span>{p.brand}</span>
          <span>{genders[p.gender]}</span>
        </div>
        <button className="product-name" onClick={openDetails}>
          {p.name}
        </button>
        <p className="product-description" title={description}>
          {description}
        </p>
        {prices}
        <button className="choose-size-button" onClick={openDetails} aria-haspopup="dialog">
          {size ? localSizeLabel(p, size) : 'Выбрать размер'} <ArrowUpRight size={17} />
        </button>
        {p.demo && <p className="product-updated">Демо · условная цена</p>}
      </div>
      <dialog
        ref={details}
        className={`product-dialog product-detail ${clothing ? 'clothing-detail' : ''}`}
        aria-labelledby={`${id}-title`}
        onClick={(e) => {
          if (e.target === e.currentTarget) details.current?.close();
        }}
      >
        <div className="dialog-header">
          <span className="eyebrow">
            {p.demo ? 'ДЕМОНСТРАЦИОННАЯ КАРТОЧКА' : `${p.brand} / ${genders[p.gender]}`}
          </span>
          <button
            className="icon-button"
            aria-label="Закрыть карточку"
            onClick={() => details.current?.close()}
          >
            <X />
          </button>
        </div>
        <div className="product-detail-layout">
          {detailsOpened && <ProductGallery product={p} />}
          <div className="product-detail-copy">
            <span className="eyebrow">{p.category}</span>
            <h2 id={`${id}-title`}>{p.name}</h2>
            <p className="product-description">{description}</p>
            {p.color && <p className="detail-color">Цвет: {p.color}</p>}
            {prices}
            <div className="detail-size-heading">
              <h3>{clothing ? 'Размер производителя' : 'Выбери размер EU'}</h3>
              {!clothing && <SizeGuide product={p} selected={size} onSelect={choose} />}
            </div>
            <div
              className="detail-sizes"
              role="group"
              aria-label={`Размер ${p.name}`}
              aria-describedby={error ? `${id}-error` : undefined}
            >
              {[...p.sizes]
                .sort((a, b) =>
                  localSizeKey(p, a).localeCompare(localSizeKey(p, b), 'en', { numeric: true }),
                )
                .map((s) => {
                  const variant = p.sizePrices?.find((v) => v.size === s);
                  return (
                    <button key={s} aria-pressed={size === s} onClick={() => choose(s)}>
                      <span>{localSizeLabel(p, s)}</span>
                      {variant && <small>{formatKzt(variant.saleKzt)}</small>}
                    </button>
                  );
                })}
            </div>
            {!p.sizes.length && <p className="notice">Сейчас нет доступных размеров.</p>}
            {error && (
              <p id={`${id}-error`} role="alert" className="error-text">
                {error}
              </p>
            )}
            {p.demo && (
              <p className="notice">Это демонстрация интерфейса. Товар недоступен для покупки.</p>
            )}
            {!p.demo && p.saleEndsAt && (
              <p className="small muted">
                Акция до {formatDate(p.saleEndsAt)} · Алматы. Наличие уточняем при заказе.
              </p>
            )}
            <div className="detail-buy-bar">
              <div>
                <span>{size ? localSizeLabel(p, size) : 'Выбери свой размер'}</span>
                <strong>
                  {pricePrefix}
                  {formatKzt(selectedPrice)}
                </strong>
              </div>
              <button
                className={`add-button ${added ? 'is-added' : ''}`}
                onClick={save}
                disabled={!p.sizes.length}
                aria-label={`Добавить ${p.name} в корзину`}
              >
                {added ? <Check size={19} /> : <Plus size={19} />}{' '}
                {added ? 'Добавлено' : 'В корзину'}
              </button>
            </div>
            <p className="small muted detail-order-note" role="status">
              {added ? (
                <button
                  className="text-link"
                  onClick={() => {
                    details.current?.close();
                    openCart();
                  }}
                >
                  Перейти в корзину <ArrowUpRight size={14} />
                </button>
              ) : (
                'Собери заказ в корзине и отправь его в WhatsApp.'
              )}
            </p>
          </div>
        </div>
      </dialog>
    </article>
  );
}
