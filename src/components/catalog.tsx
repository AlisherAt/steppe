'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  X,
  RotateCcw,
  ShieldCheck,
  Clock3,
  MoveUpRight,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { defaultFilters, type CatalogResult, type Filters } from '@/lib/types';
import { filterParams, filtersSchema } from '@/lib/catalog';
import { ProductCard } from './product-card';
import { catalogBrands as brandNames } from '@/lib/catalog-policy';
import { demoEnabled } from '@/lib/catalog-mode';
import { formatKzt } from '@/lib/money';
export function Catalog({
  initial,
  initialMode,
}: {
  initial: CatalogResult;
  initialMode: 'live' | 'demo';
}) {
  const [result, setResult] = useState(initial);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [mode, setMode] = useState(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initial.error || '');
  const [retry, setRetry] = useState(0);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [brandQuery, setBrandQuery] = useState('');
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const visibleBrands = [...new Set([...result.facets.brands, ...filters.brands, ...brandNames])]
    .filter((b) => mode === 'demo' || brandNames.includes(b))
    .filter((b) => b.toLocaleLowerCase('ru').includes(brandQuery.toLocaleLowerCase('ru')))
    .sort(
      (a, b) =>
        Number(result.facets.brands.includes(b)) - Number(result.facets.brands.includes(a)) ||
        a.localeCompare(b),
    );
  const section = useRef<HTMLElement>(null);
  const filterDialog = useRef<HTMLDialogElement>(null);
  const heroProduct = initial.products.find((p) => brandNames.includes(p.brand) && p.imageUrl);
  useEffect(() => {
    const dialog = filterDialog.current;
    if (mobileFilters && dialog && !dialog.open) dialog.showModal();
    else if (!mobileFilters && dialog?.open) dialog.close();
  }, [mobileFilters]);
  useEffect(() => {
    const desktop = matchMedia('(min-width: 761px)');
    const close = () => {
      if (desktop.matches) setMobileFilters(false);
    };
    desktop.addEventListener('change', close);
    return () => desktop.removeEventListener('change', close);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const parsed = filtersSchema.safeParse(Object.fromEntries(params));
    if (parsed.success) setFilters(parsed.data);
    if (params.get('mode') === 'live' || (demoEnabled() && params.get('mode') === 'demo'))
      setMode(params.get('mode') as 'live' | 'demo');
    setHydrated(true);
    const pop = () => {
      const p = new URLSearchParams(location.search);
      const f = filtersSchema.safeParse(Object.fromEntries(p));
      if (f.success) setFilters(f.data);
      setMode(demoEnabled() && p.get('mode') === 'demo' ? 'demo' : 'live');
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      const params = filterParams(filters, mode);
      window.history.replaceState(null, '', `/?${params}`);
      try {
        const response = await fetch(`/api/catalog?${params}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Не удалось загрузить каталог');
        setResult(data);
        setError('');
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Не удалось загрузить каталог');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filters, mode, retry, hydrated]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (tool: unknown, options: { signal: AbortSignal }) => unknown;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'search_sneaker_catalog',
            description:
              'Показать кроссовки по поисковому запросу в текущем каталоге. Данные demo не являются предложениями.',
            inputSchema: {
              type: 'object',
              properties: { query: { type: 'string', maxLength: 100 } },
              required: ['query'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false },
            execute: (input: unknown) => {
              if (
                !input ||
                typeof input !== 'object' ||
                !('query' in input) ||
                typeof input.query !== 'string' ||
                input.query.length > 100
              )
                throw new Error('Некорректный запрос');
              setFilters((f) => ({ ...f, q: input.query as string, page: 1 }));
              return { query: input.query, mode, status: 'search_started' };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, [mode]);
  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value, page: key === 'page' ? Number(value) : 1 }));
  }
  function scrollToCatalog() {
    section.current?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }
  function toggle(key: 'brands' | 'sizes' | 'sources', value: string) {
    update(
      key,
      filters[key].includes(value)
        ? filters[key].filter((v) => v !== value)
        : [...filters[key], value],
    );
  }
  const activeCount =
    filters.brands.length +
    filters.sizes.length +
    filters.sources.length +
    Number(Boolean(filters.gender)) +
    Number(Boolean(filters.category)) +
    Number(filters.minDiscount > 0) +
    Number(filters.minPrice > 0 || filters.maxPrice < 1000000);
  const controls = (
    <>
      <div className="filter-heading">
        <h3>Фильтры{activeCount > 0 && <span>{activeCount}</span>}</h3>
        <button
          className="reset-button"
          aria-label="Сбросить фильтры"
          onClick={() => setFilters(defaultFilters)}
        >
          <RotateCcw size={16} />
        </button>
      </div>
      <fieldset>
        <legend>Бренд</legend>
        <input
          className="brand-search"
          aria-label="Найти бренд в фильтрах"
          placeholder="Найти бренд…"
          value={brandQuery}
          onChange={(e) => setBrandQuery(e.target.value)}
        />
        <div className="brand-filter-list">
          {visibleBrands.map((brand) => (
            <label className="check-label" key={brand}>
              <input
                type="checkbox"
                checked={filters.brands.includes(brand)}
                onChange={() => toggle('brands', brand)}
              />
              <span>{brand}</span>
              {!result.facets.brands.includes(brand) && (
                <span
                  className="brand-empty-label"
                  aria-hidden="true"
                  title="В текущем режиме нет предложений"
                >
                  —
                </span>
              )}
            </label>
          ))}
          {!visibleBrands.length && <p className="small muted">Бренд не найден</p>}
        </div>
        <Link href="/brands" className="brand-directory-link">
          Все бренды · {brandNames.length} <ArrowUpRight size={13} />
        </Link>
      </fieldset>
      <fieldset>
        <legend>Для кого</legend>
        <div className="gender-options">
          {[
            ['', 'Все'],
            ['men', 'Мужские'],
            ['women', 'Женские'],
            ['unisex', 'Унисекс'],
            ['kids', 'Детские'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={filters.gender === value ? 'selected' : ''}
              onClick={() => update('gender', value)}
              aria-pressed={filters.gender === value}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>
          Размер <span className="muted">EU / US</span>
        </legend>
        <div className="size-grid">
          {(result.facets.sizes.length
            ? result.facets.sizes
            : ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45']
          ).map((size) => (
            <button
              key={size}
              aria-pressed={filters.sizes.includes(size)}
              className={filters.sizes.includes(size) ? 'selected' : ''}
              onClick={() => toggle('sizes', size)}
            >
              {size}
            </button>
          ))}
        </div>
        <p className="filter-hint">Сверяй размерную сетку магазина</p>
      </fieldset>
      <fieldset>
        <legend>Цена, ₸</legend>
        <div className="price-fields">
          <label>
            <span>От</span>
            <input
              type="number"
              aria-label="Цена от"
              min={0}
              max={1000000}
              value={filters.minPrice || ''}
              placeholder="0"
              onChange={(e) => update('minPrice', Number(e.target.value))}
            />
          </label>
          <span>—</span>
          <label>
            <span>До</span>
            <input
              type="number"
              aria-label="Цена до"
              min={0}
              max={1000000}
              value={filters.maxPrice === 1000000 ? '' : filters.maxPrice}
              placeholder="Любая"
              onChange={(e) =>
                update('maxPrice', e.target.value ? Number(e.target.value) : 1000000)
              }
            />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Скидка</legend>
        <div className="discount-options">
          {[0, 20, 30, 50].map((value) => (
            <button
              key={value}
              className={filters.minDiscount === value ? 'selected' : ''}
              aria-pressed={filters.minDiscount === value}
              onClick={() => update('minDiscount', value)}
            >
              {value ? `от ${value}%` : 'Все'}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Магазин</legend>
        {(result.facets.sources.length
          ? result.facets.sources
          : [
              { id: 'puma-us', name: 'Puma US' },
              { id: 'reebok-us', name: 'Reebok US' },
            ]
        ).map((s) => (
          <label className="check-label" key={s.id}>
            <input
              type="checkbox"
              checked={filters.sources.includes(s.id)}
              onChange={() => toggle('sources', s.id)}
            />
            <span>{s.name}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Назначение</legend>
        <select
          aria-label="Назначение"
          value={filters.category}
          onChange={(e) => update('category', e.target.value)}
        >
          <option value="">Все категории</option>
          {result.facets.categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </fieldset>
      <div className="filter-note">
        <ShieldCheck size={22} />
        <p>
          Выбираешь здесь.
          <br />
          Покупаешь у магазина.
        </p>
        <Link href="/about">
          Подробнее <ArrowUpRight size={14} />
        </Link>
      </div>
    </>
  );
  return (
    <main id="main-content" className="storefront">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="hero-status-dot" /> PUMA + REEBOK / США → КАЗАХСТАН
          </span>
          <h1>
            Твой ритм.
            <br />
            <span>Твоя пара.</span>
          </h1>
          <p>
            На пробежку, тренировку и просто по своим делам.
            <br />
            Находи свою пару по приятной цене.
          </p>
          <a href="#catalog" className="hero-link">
            Смотреть кроссовки <ArrowUpRight size={20} />
          </a>
          <div className="hero-footnote">
            <span>01 / 02</span> Два бренда. Сотни способов быть собой.
          </div>
        </div>
        <div className="hero-visual">
          <span className="hero-outline" aria-hidden="true">
            STEPPE
          </span>
          <span className="hero-orbit" aria-hidden="true" />
          {heroProduct?.imageUrl && !heroImageFailed && (
            <Image
              src={heroProduct.imageUrl}
              alt="Кроссовки из коллекции Puma и Reebok"
              fill
              priority
              sizes="(max-width: 700px) 100vw, 48vw"
              onError={() => setHeroImageFailed(true)}
            />
          )}
          <div className="hero-image-label">
            <Sparkles size={16} /> ВЫБИРАЙ СВОЙ РИТМ
          </div>
          <span className="hero-sticker" aria-hidden="true">
            ХОРОШИЙ
            <br />
            <strong>ХОД ↗</strong>
          </span>
          {heroProduct && (
            <a className="hero-product-note" href="#catalog">
              <span>
                {heroProduct.brand} / {heroProduct.name}
              </span>
              <strong>от {formatKzt(heroProduct.saleKzt)}</strong>
              <ArrowDown size={18} />
            </a>
          )}
        </div>
      </section>
      <div className="benefits">
        <span>
          <Search size={17} />
          Puma + Reebok
        </span>
        <span>
          <Clock3 size={17} />
          Обновления дважды в день
        </span>
        <span>
          <ShieldCheck size={17} />
          Заказ через WhatsApp
        </span>
        <Link href="/sources">
          Как обновляем каталог <ArrowUpRight size={13} />
        </Link>
      </div>
      <section id="catalog" ref={section} className="catalog-section">
        <div className="catalog-heading">
          <div>
            <span className="eyebrow">ТВОЯ СЛЕДУЮЩАЯ НАХОДКА</span>
            <h2>
              Лови свою пару<span className="heading-dot">.</span>
            </h2>
          </div>
          {demoEnabled() && (
            <div className="catalog-mode" aria-label="Режим каталога">
              <button
                aria-pressed={mode === 'live'}
                className={mode === 'live' ? 'selected' : ''}
                onClick={() => {
                  setMode('live');
                  setFilters(defaultFilters);
                }}
              >
                Предложения
              </button>
              <button
                aria-pressed={mode === 'demo'}
                className={mode === 'demo' ? 'selected' : ''}
                onClick={() => {
                  setMode('demo');
                  setFilters(defaultFilters);
                }}
              >
                Демокаталог
              </button>
            </div>
          )}
        </div>
        <div className="quick-filters" aria-label="Быстрые фильтры">
          <div className="brand-switch" aria-label="Бренд">
            <button aria-pressed={!filters.brands.length} onClick={() => update('brands', [])}>
              Все пары
            </button>
            {brandNames.map((brand) => (
              <button
                key={brand}
                aria-pressed={filters.brands.length === 1 && filters.brands[0] === brand}
                onClick={() => update('brands', [brand])}
              >
                {brand}
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
          <button
            className="budget-chip"
            aria-pressed={filters.maxPrice === 30000}
            onClick={() =>
              setFilters((f) => ({
                ...f,
                minPrice: 0,
                maxPrice: f.maxPrice === 30000 ? 1000000 : 30000,
                page: 1,
              }))
            }
          >
            До 30 000 ₸ <Sparkles size={15} />
          </button>
        </div>
        {mode === 'demo' && (
          <div className="demo-notice">
            <span className="demo-pill">ДЕМО</span>
            <p>Знакомься с каталогом. Эти товары и цены — примеры, они недоступны для покупки.</p>
            <Link href="/sources">
              Статус магазинов <ArrowUpRight size={15} />
            </Link>
          </div>
        )}
        <div className="catalog-toolbar">
          <div className="search-field">
            <Search size={20} />
            <input
              aria-label="Поиск кроссовок"
              placeholder="Найди модель: Nano, NITRO, Classic…"
              value={filters.q}
              onChange={(e) => update('q', e.target.value)}
              maxLength={100}
            />
            {filters.q && (
              <button
                className="icon-button"
                onClick={() => update('q', '')}
                aria-label="Очистить поиск"
              >
                <X size={17} />
              </button>
            )}
          </div>
          <button
            className="mobile-filter-button"
            onClick={() => setMobileFilters(!mobileFilters)}
            aria-expanded={mobileFilters}
            aria-controls="mobile-filters"
          >
            <SlidersHorizontal size={18} />
            Фильтры{activeCount ? ` (${activeCount})` : ''}
          </button>
          <label className="sort-control">
            <span>Сначала</span>
            <select
              aria-label="Сортировка"
              value={filters.sort}
              onChange={(e) => update('sort', e.target.value as Filters['sort'])}
            >
              <option value="newest">Новые находки</option>
              <option value="discount">Большие скидки</option>
              <option value="price_asc">Дешевле</option>
              <option value="price_desc">Дороже</option>
            </select>
          </label>
        </div>
        <div className="catalog-layout">
          <aside className="filters" aria-label="Фильтры каталога">
            {controls}
          </aside>
          <div className="catalog-results" aria-busy={loading}>
            <div className="results-heading">
              <span aria-live="polite">
                {loading
                  ? 'Ищем подходящие пары…'
                  : `${result.total} ${mode === 'demo' ? 'демопримеров' : 'предложений'}`}
              </span>
              <span className="results-caption">
                {mode === 'demo' ? 'Иллюстрации · условные цены' : 'Актуальные предложения'}
              </span>
            </div>
            {error ? (
              <div className="empty-state" role="alert">
                <RotateCcw size={35} />
                <h3>Не получилось загрузить каталог</h3>
                <p>{error}</p>
                <button className="button dark" onClick={() => setRetry((v) => v + 1)}>
                  Попробовать ещё раз
                </button>
              </div>
            ) : loading && result.mode !== mode ? (
              <div className="product-grid">
                {[1, 2, 3].map((i) => (
                  <div className="skeleton-card" key={i} />
                ))}
              </div>
            ) : !result.products.length ? (
              <div className="empty-state">
                <Search size={38} strokeWidth={1.3} />
                <h3>
                  {mode === 'live' && !activeCount && !filters.q
                    ? 'Скоро здесь будут находки'
                    : 'Эта пара пока не нашлась'}
                </h3>
                <p>
                  {mode === 'live' && !activeCount && !filters.q
                    ? 'Подключаем поставщиков США и Европы с фиксированной ценой и наличием каждого размера. Предложения с торгами не показываем.'
                    : 'Попробуй другой размер, бренд или чуть более широкий диапазон цен.'}
                </p>
                <div className="empty-actions">
                  <button
                    className="button dark"
                    onClick={() =>
                      demoEnabled() && mode === 'live' && !activeCount && !filters.q
                        ? setMode('demo')
                        : setFilters(defaultFilters)
                    }
                  >
                    {demoEnabled() && mode === 'live' && !activeCount && !filters.q
                      ? 'Посмотреть демокаталог'
                      : 'Сбросить фильтры'}
                    <ArrowRight size={17} />
                  </button>
                  <Link href="/sources" className="text-link">
                    Магазины <ArrowUpRight size={16} />
                  </Link>
                </div>
              </div>
            ) : (
              <div className={`product-grid ${loading ? 'is-loading' : ''}`}>
                {result.products.map((p, i) => (
                  <ProductCard product={p} key={p.id} priority={i < 3} />
                ))}
              </div>
            )}
            {result.pages > 1 && (
              <nav className="pagination" aria-label="Страницы каталога">
                <button
                  className="icon-button"
                  disabled={filters.page === 1}
                  aria-label="Предыдущая страница"
                  onClick={() => update('page', filters.page - 1)}
                >
                  <ChevronLeft />
                </button>
                <span>
                  {filters.page} / {result.pages}
                </span>
                <button
                  className="icon-button"
                  disabled={filters.page >= result.pages}
                  aria-label="Следующая страница"
                  onClick={() => {
                    update('page', filters.page + 1);
                    scrollToCatalog();
                  }}
                >
                  <ChevronRight />
                </button>
              </nav>
            )}
            <div className="catalog-bottom">
              <span className="tiny-star">✳</span>
              <p>Твой стиль не обязан стоить больше.</p>
              <MoveUpRight size={26} />
            </div>
          </div>
        </div>
      </section>
      <dialog
        id="mobile-filters"
        ref={filterDialog}
        className="filter-dialog"
        aria-labelledby="mobile-filters-title"
        onClose={() => setMobileFilters(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setMobileFilters(false);
        }}
      >
        <div className="dialog-header">
          <h2 id="mobile-filters-title">Твоя идеальная пара</h2>
          <button
            className="icon-button"
            aria-label="Закрыть фильтры"
            onClick={() => setMobileFilters(false)}
          >
            <X size={22} />
          </button>
        </div>
        <div className="mobile-filter-content">{controls}</div>
        <div className="filter-dialog-footer">
          <button className="filter-clear" onClick={() => setFilters(defaultFilters)}>
            Сбросить все
          </button>
          <button
            className="button dark"
            onClick={() => {
              setMobileFilters(false);
              scrollToCatalog();
            }}
          >
            Показать результаты <ArrowRight size={18} />
          </button>
        </div>
      </dialog>
    </main>
  );
}
