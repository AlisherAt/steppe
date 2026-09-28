'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowUpRight, X } from 'lucide-react';
import type { Outfit } from '@/lib/outfits';
import { formatKzt } from '@/lib/money';
import { ProductCard } from './product-card';
export function OutfitCollections() {
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [gender, setGender] = useState<'women' | 'men'>('women');
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const root = useRef<HTMLElement>(null);
  const detail = useRef<HTMLElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setStatus('loading');
        fetch('/api/outfits', { signal: controller.signal })
          .then(async (r) => {
            if (!r.ok) throw new Error();
            return r.json();
          })
          .then((data) => {
            setOutfits(data.outfits);
            setStatus('ready');
          })
          .catch(() => {
            if (!controller.signal.aborted) setStatus('error');
          });
      },
      { rootMargin: '300px' },
    );
    if (root.current) observer.observe(root.current);
    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [retry]);
  const active = outfits.find((outfit) => outfit.id === selected);
  useEffect(() => {
    if (selected)
      detail.current?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
  }, [selected]);
  return (
    <section ref={root} id="outfits" className="outfit-section" aria-labelledby="outfit-heading">
      <div className="outfit-heading">
        <div>
          <span className="eyebrow">STEPPE / СОЧЕТАНИЯ</span>
          <h2 id="outfit-heading">
            Вместе — ещё интереснее<span>.</span>
          </h2>
          <p>Готовые идеи из каталога. Выбирай вещи и размеры по отдельности.</p>
        </div>
        <div className="outfit-genders" role="group" aria-label="Образы для кого">
          {(['women', 'men'] as const).map((g) => (
            <button
              key={g}
              aria-pressed={gender === g}
              onClick={() => {
                setGender(g);
                setSelected('');
              }}
            >
              {g === 'women' ? 'Для неё' : 'Для него'}
            </button>
          ))}
        </div>
      </div>
      {status === 'loading' ? (
        <p role="status">Собираем сочетания…</p>
      ) : status === 'error' ? (
        <p role="alert">
          Не удалось загрузить образы.{' '}
          <button className="text-link" onClick={() => setRetry((v) => v + 1)}>
            Повторить
          </button>
        </p>
      ) : !outfits.some((o) => o.gender === gender) ? (
        <p>Пока не хватает доступных вещей для полного образа. Можно собрать свой в каталоге.</p>
      ) : (
        <div className="outfit-rail">
          {outfits
            .filter((o) => o.gender === gender)
            .map((o) => (
              <button
                className="outfit-tile"
                key={o.id}
                aria-expanded={selected === o.id}
                onClick={() => setSelected(selected === o.id ? '' : o.id)}
              >
                <div className="outfit-collage">
                  {o.products.map((p, index) => (
                    <span key={p.id}>
                      <Image
                        src={p.imageUrl!}
                        alt={p.name}
                        fill
                        sizes="(max-width: 760px) 90px, 130px"
                      />
                      <small>{['Кроссовки', 'Верх', 'Брюки'][index]}</small>
                    </span>
                  ))}
                </div>
                <span className="outfit-tile-heading">
                  {o.title}
                  <ArrowUpRight size={18} />
                </span>
                <span className="outfit-tile-price">
                  3 вещи · {o.variablePrice ? 'от ' : ''}
                  {formatKzt(o.total)}
                </span>
              </button>
            ))}
        </div>
      )}
      {active && (
        <section ref={detail} className="outfit-expanded" aria-label={active.title}>
          <div className="outfit-detail-heading">
            <div>
              <h3>{active.title}</h3>
              <p>{active.description}</p>
            </div>
            <button
              className="icon-button"
              aria-label="Свернуть образ"
              onClick={() => {
                setSelected('');
                root.current
                  ?.querySelector<HTMLButtonElement>(`button[aria-expanded="true"]`)
                  ?.focus();
              }}
            >
              <X size={20} />
            </button>
          </div>
          <p className="small muted">
            Размер каждой вещи выбирается отдельно. Сумма — по ценам каталога; условия доставки
            согласуем в WhatsApp.
          </p>
          <div className="product-grid">
            {active.products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
