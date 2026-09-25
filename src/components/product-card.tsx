'use client';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { ArrowUpRight, Plus, X, ShoppingBag } from 'lucide-react';
import type { Product } from '@/lib/types';
import { sizeLabel } from '@/lib/official-stores';
import { formatKzt, formatDate, discountPercent } from '@/lib/money';
import { useStore } from './store-provider';
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
  const [imageError, setImageError] = useState(false);
  const details = useRef<HTMLDialogElement>(null);
  const { add } = useStore();
  const selectedPrice = p.sizePrices?.find((v) => v.size === size)?.saleKzt ?? p.saleKzt;
  const selectedSourcePrice = p.sizePrices?.find((v) => v.size === size)?.salePrice ?? p.salePrice;
  const discount = p.originalPrice ? discountPercent(p.originalPrice, selectedSourcePrice) : 0;
  const pricePrefix = !size && new Set(p.sizePrices?.map((v) => v.saleKzt)).size > 1 ? 'от ' : '';
  function save() {
    if (p.sizes.length && !size) {
      setError('Сначала выбери размер');
      return;
    }
    add(p, size);
    setError('');
  }
  return (
    <article className="product-card">
      <button
        className="product-image-button"
        onClick={() => details.current?.showModal()}
        aria-label={`Подробнее: ${p.name}`}
      >
        {p.imageUrl && !imageError ? (
          <Image
            src={p.imageUrl}
            alt={p.demo ? `Иллюстрация кроссовок, демопример ${p.brand}` : `${p.brand} ${p.name}`}
            fill
            sizes="(max-width: 580px) 90vw, (max-width: 1000px) 43vw, 26vw"
            className="product-image"
            priority={priority}
            onError={() => setImageError(true)}
          />
        ) : (
          <span className="image-placeholder">
            <ShoppingBag size={42} />
            <span>Фото скоро появится</span>
          </span>
        )}
        {discount > 0 && <span className="discount-badge">−{discount}%</span>}
        {p.demo && <span className="demo-badge">ДЕМО</span>}
        <span className="image-open">
          <ArrowUpRight size={18} />
        </span>
      </button>
      <div className="product-info">
        <div className="product-meta">
          <span>{p.brand}</span>
          <span>{genders[p.gender]}</span>
        </div>
        <button className="product-name" onClick={() => details.current?.showModal()}>
          {p.name}
        </button>
        <div className="product-prices">
          <strong>
            {pricePrefix}
            {formatKzt(selectedPrice)}
          </strong>
          {p.originalKzt !== null && <del>{formatKzt(p.originalKzt)}</del>}
        </div>
        {p.offerKind === 'retail' && (
          <p className="product-updated">
            Покупка без торгов · магазин {p.market === 'US' ? 'США' : 'Европы'} · цена выбранного
            размера
          </p>
        )}
        {p.offerKind === 'market' && (
          <p className="product-updated">Рынок США · цена зависит от размера</p>
        )}
        <div className="size-row">
          <label className="sr-only" htmlFor={`size-${p.id}`}>
            Размер {p.name}
          </label>
          <select
            id={`size-${p.id}`}
            value={size}
            onChange={(e) => {
              setSize(e.target.value);
              setError('');
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `error-${p.id}` : undefined}
          >
            <option value="">{p.sizes.length ? 'Выберите размер' : 'Размер у продавца'}</option>
            {p.sizes.map((s) => (
              <option key={s} value={s}>
                {sizeLabel(s)}
                {p.sizePrices?.find((v) => v.size === s)
                  ? ` · ${formatKzt(p.sizePrices.find((v) => v.size === s)!.saleKzt)}`
                  : ''}
              </option>
            ))}
          </select>
          <button className="add-button" onClick={save} aria-label={`Добавить ${p.name} в корзину`}>
            <Plus size={19} />
            <span>В корзину</span>
          </button>
        </div>
        {error && (
          <p id={`error-${p.id}`} role="alert" className="error-text">
            {error}
          </p>
        )}
        <div className="product-footer">
          <span className="store-label">
            <span className="store-dot" />
            {p.sourceName}
          </span>
        </div>
        {p.demo && <p className="product-updated">Условная цена · фото для иллюстрации</p>}
        {!p.demo && p.saleEndsAt && (
          <p className="product-updated">
            Акция до {formatDate(p.saleEndsAt)} · Алматы. Срок указан магазином; цена и наличие
            могли измениться после проверки.
          </p>
        )}
      </div>
      <dialog
        ref={details}
        className="product-dialog"
        aria-labelledby={`title-${p.id}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) details.current?.close();
        }}
      >
        <div className="dialog-header">
          <span className="eyebrow">{p.demo ? 'ДЕМОНСТРАЦИОННАЯ КАРТОЧКА' : p.brand}</span>
          <button
            className="icon-button"
            aria-label="Закрыть карточку"
            onClick={() => details.current?.close()}
          >
            <X />
          </button>
        </div>
        <h2 id={`title-${p.id}`}>{p.name}</h2>
        <div className="product-prices">
          <strong>
            {pricePrefix}
            {formatKzt(selectedPrice)}
          </strong>
          {p.originalKzt !== null && <del>{formatKzt(p.originalKzt)}</del>}
          {p.discount > 0 && <span className="inline-discount">−{p.discount}%</span>}
        </div>
        <p>
          {genders[p.gender]} · {p.category} · {p.sourceName}
        </p>
        {p.demo && (
          <p className="notice">
            Это пример интерфейса. Название и цены условные, фотография иллюстративная. Это не
            предложение о продаже.
          </p>
        )}
        <button className="button dark" onClick={() => details.current?.close()}>
          Выбрать размер в карточке
        </button>
      </dialog>
    </article>
  );
}
