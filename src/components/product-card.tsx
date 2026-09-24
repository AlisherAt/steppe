'use client';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { ArrowUpRight, Plus, X, ShoppingBag } from 'lucide-react';
import type { Product } from '@/lib/types';
import { formatKzt, formatDate, formatRate } from '@/lib/money';
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
        <span className="discount-badge">−{p.discount}%</span>
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
          <strong>{formatKzt(p.saleKzt)}</strong>
          <del>{formatKzt(p.originalKzt)}</del>
        </div>
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
            <option value="">{p.sizes.length ? 'Размер EU' : 'Размер у продавца'}</option>
            {p.sizes.map((s) => (
              <option key={s} value={s}>
                {s}
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
          <a
            href={p.productUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            aria-label={
              p.demo
                ? `Открыть сайт бренда ${p.sourceName}`
                : `Купить ${p.name} на сайте ${p.sourceName}`
            }
          >
            {p.demo ? 'Сайт бренда' : 'В магазин'}
            <ArrowUpRight size={14} />
          </a>
        </div>
        <p className="product-updated">
          {p.demo
            ? 'Условная цена · фото для иллюстрации'
            : `Проверено ${formatDate(p.updatedAt)} · Алматы`}
        </p>
        {!p.demo && p.saleEndsAt && (
          <p className="product-updated">
            Акция до {formatDate(p.saleEndsAt)} · Алматы. Срок указан магазином; цена и наличие
            могли измениться после проверки.
          </p>
        )}
        {!p.demo && p.delivery && (
          <p className="product-updated">
            Доставка KZ · по данным {p.delivery.basis === 'ebay-filter' ? 'eBay' : 'магазина'}
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
          <strong>{formatKzt(p.saleKzt)}</strong>
          <del>{formatKzt(p.originalKzt)}</del>
          <span className="inline-discount">−{p.discount}%</span>
        </div>
        <p>
          {genders[p.gender]} · {p.category} · {p.sourceName}
        </p>
        <p>Размеры EU: {p.sizes.join(', ') || 'уточняйте у продавца'}</p>
        {p.demo ? (
          <p className="notice">
            Это пример интерфейса. Название и цены условные, фотография иллюстративная. Это не
            предложение о продаже.
          </p>
        ) : (
          <div className="rate-details">
            <h3>Откуда цена в тенге</h3>
            {p.delivery && (
              <p>
                Доставка в Казахстан указана{' '}
                {p.delivery.basis === 'ebay-filter'
                  ? 'в результатах eBay для KZ'
                  : 'в региональной выгрузке магазина'}
                . Проверено {formatDate(p.delivery.checkedAt)}.{' '}
                <a href={p.delivery.policyUrl} target="_blank" rel="noopener noreferrer">
                  Условия доставки
                </a>
                . Конкретный адрес, размер, стоимость доставки и пошлины уточняются при оформлении.
              </p>
            )}
            <p>{p.rate.source}</p>
            {p.currency !== 'KZT' && (
              <p>
                1 {p.currency} = {formatRate(p.rate.value)}
              </p>
            )}
            <p>
              Курс на {formatDate(p.rate.asOf)}. Получен {formatDate(p.rate.fetchedAt)}.
            </p>
            <p>
              Пересчитано {formatDate(p.updatedAt)} · Алматы. Исходные цены и валюта {p.currency}{' '}
              сохранены. Скидка рассчитана в валюте магазина.
            </p>
            <p>
              Курс банка при оплате может отличаться. Доставка в Казахстан, её стоимость и пошлины
              проверяются у продавца.
            </p>
          </div>
        )}
        <a
          className="button dark"
          href={p.productUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
        >
          {p.demo ? 'Открыть сайт бренда' : 'Перейти к предложению'}
          <ArrowUpRight size={18} />
        </a>
      </dialog>
    </article>
  );
}
