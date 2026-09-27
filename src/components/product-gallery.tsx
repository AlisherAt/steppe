'use client';
import Image from 'next/image';
import { useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Expand, ShoppingBag } from 'lucide-react';
import type { Product } from '@/lib/types';

export function ProductGallery({
  product,
  priority = false,
  onOpen,
  children,
}: {
  product: Product;
  priority?: boolean;
  onOpen?: () => void;
  children?: ReactNode;
}) {
  const images = [
    ...new Set(
      [product.imageUrl, ...(product.imageUrls || [])].filter((v): v is string => Boolean(v)),
    ),
  ].slice(0, 10);
  const [failed, setFailed] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const available = images.filter((url) => !failed.includes(url));
  const current = Math.min(index, Math.max(available.length - 1, 0));
  function go(to: number) {
    const element = track.current;
    if (!element) return;
    element.scrollTo({
      left: Math.max(0, Math.min(to, available.length - 1)) * element.clientWidth,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }
  return (
    <div
      className="product-gallery"
      role="region"
      aria-label={`Фотографии: ${product.name}`}
      aria-roledescription="карусель"
    >
      <div
        className="gallery-track"
        ref={track}
        tabIndex={available.length > 1 ? 0 : undefined}
        aria-label="Листать фотографии стрелками влево и вправо"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            go(current + (e.key === 'ArrowRight' ? 1 : -1));
          }
        }}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {available.length ? (
          available.map((url, i) => (
            <button
              type="button"
              className="gallery-slide"
              key={url}
              onClick={onOpen}
              tabIndex={i === current && onOpen ? 0 : -1}
              aria-label={`${onOpen ? 'Открыть' : ''} фото ${i + 1}: ${product.name}`}
            >
              {Math.abs(i - current) <= 1 && (
                <Image
                  src={
                    product.department &&
                    product.department !== 'sneakers' &&
                    product.brand === 'Puma'
                      ? url.replace(/w_2000,h_2000/, 'w_600,h_600')
                      : url
                  }
                  unoptimized={Boolean(
                    product.department &&
                    product.department !== 'sneakers' &&
                    product.brand === 'Puma',
                  )}
                  alt={`${product.name} — фото ${i + 1}`}
                  fill
                  sizes="(max-width: 580px) 90vw, (max-width: 1000px) 43vw, 400px"
                  className="gallery-image"
                  preload={priority && i === 0}
                  onError={() => setFailed((list) => [...list, url])}
                />
              )}
            </button>
          ))
        ) : (
          <div className="gallery-slide image-placeholder">
            <ShoppingBag size={40} />
            <span>Фото скоро появится</span>
          </div>
        )}
      </div>
      {children}
      {onOpen && (
        <button
          type="button"
          className="gallery-expand"
          aria-label={`Подробнее: ${product.name}`}
          onClick={onOpen}
        >
          <Expand size={17} />
        </button>
      )}
      {available.length > 1 && (
        <>
          <button
            type="button"
            className="gallery-arrow gallery-prev"
            aria-label="Предыдущее фото"
            disabled={current === 0}
            onClick={() => go(current - 1)}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            className="gallery-arrow gallery-next"
            aria-label="Следующее фото"
            disabled={current === available.length - 1}
            onClick={() => go(current + 1)}
          >
            <ChevronRight size={20} />
          </button>
          <div className="gallery-pagination">
            <span className="gallery-count" aria-live="polite" aria-atomic="true">
              {current + 1} / {available.length}
            </span>
            <div className="gallery-dots" role="group" aria-label="Выбрать фотографию">
              {available.map((url, i) => (
                <button
                  type="button"
                  key={url}
                  aria-label={`Фото ${i + 1}`}
                  aria-pressed={current === i}
                  onClick={() => go(i)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
