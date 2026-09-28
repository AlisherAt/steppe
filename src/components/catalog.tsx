'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
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
import { SizeFilter } from './size-filter';
import { collections } from '@/lib/product-collections';
import { OutfitCollections } from './outfit-collections';
export function Catalog({
  initial,
  initialMode,
  department = 'sneakers',
}: {
  initial: CatalogResult;
  initialMode: 'live' | 'demo';
  department?: 'sneakers' | 'sportswear' | 'casual';
}) {
  const clothing = department !== 'sneakers';
  const defaults = { ...defaultFilters, department };
  const brandsForSection = clothing
    ? department === 'casual'
      ? ['Uniqlo']
      : ['Nike', 'Puma', 'Reebok']
    : brandNames.filter((b) => b !== 'Uniqlo');
  const [result, setResult] = useState(initial);
  const [filters, setFilters] = useState<Filters>(defaults);
  const [mode, setMode] = useState(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initial.error || '');
  const [retry, setRetry] = useState(0);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [brandQuery, setBrandQuery] = useState('');
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const visibleBrands = [
    ...new Set([...result.facets.brands, ...filters.brands, ...brandsForSection]),
  ]
    .filter((b) => mode === 'demo' || brandsForSection.includes(b))
    .filter((b) => b.toLocaleLowerCase('ru').includes(brandQuery.toLocaleLowerCase('ru')))
    .sort(
      (a, b) =>
        Number(result.facets.brands.includes(b)) - Number(result.facets.brands.includes(a)) ||
        a.localeCompare(b),
    );
  const section = useRef<HTMLElement>(null);
  const filterDialog = useRef<HTMLDialogElement>(null);
  const heroProduct =
    initial.products.find(
      (p) => p.gender !== 'kids' && brandNames.includes(p.brand) && p.imageUrl,
    ) || initial.products.find((p) => p.imageUrl);
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
    if (parsed.success) setFilters({ ...parsed.data, department, sources: [] });
    if (params.get('mode') === 'live' || (demoEnabled() && params.get('mode') === 'demo'))
      setMode(params.get('mode') as 'live' | 'demo');
    setHydrated(true);
    const pop = () => {
      const p = new URLSearchParams(location.search);
      const f = filtersSchema.safeParse(Object.fromEntries(p));
      if (f.success) setFilters({ ...f.data, department, sources: [] });
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
      window.history.replaceState(null, '', `${clothing ? '/clothing' : '/'}?${params}`);
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
            name: clothing ? 'search_clothing_catalog' : 'search_sneaker_catalog',
            description:
              'Показать товары по поисковому запросу в текущем разделе каталога. Данные demo не являются предложениями.',
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
  function toggle(key: 'brands' | 'sizes', value: string) {
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
    Number(Boolean(filters.gender)) +
    Number(Boolean(filters.category)) +
    Number(Boolean(filters.collection)) +
    Number(filters.minDiscount > 0) +
    Number(filters.minPrice > 0 || filters.maxPrice < 1000000);
  const controls = (
    <>
      <div className="filter-heading">
        <h3>Фильтры{activeCount > 0 && <span>{activeCount}</span>}</h3>
        <button
          className="reset-button"
          aria-label="Сбросить фильтры"
          onClick={() => setFilters(defaults)}
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
      <SizeFilter
        clothing={clothing}
        sizes={result.facets.sizes}
        groups={result.facets.sizeGroups}
        selected={filters.sizes}
        gender={filters.gender}
        onChange={(sizes) => update('sizes', sizes)}
      />
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
          Заказываешь в WhatsApp.
        </p>
        <Link href="/about">
          Подробнее <ArrowUpRight size={14} />
        </Link>
      </div>
    </>
  );
  return (
    <main id="main-content" className="storefront">
      <section className={`edit-hero ${clothing ? 'edit-hero-clothing' : ''}`}>
        <div className="edit-hero-copy">
          <span className="eyebrow">STEPPE / ВЫБОР НА КАЖДЫЙ ДЕНЬ</span>
          <h1>
            {clothing ? 'Носи по-своему' : 'В твоём ритме'}
            <span>.</span>
          </h1>
          <p>
            {clothing
              ? 'Спортивная и повседневная одежда для твоих сочетаний.'
              : 'Кроссовки Nike, Puma и Reebok. Найди пару под свои планы.'}
          </p>
          <div className="edit-hero-actions">
            <a href="#catalog" className="button dark">
              {clothing ? 'Смотреть одежду' : 'Смотреть кроссовки'} <ArrowUpRight size={18} />
            </a>
            {mode === 'live' && (
              <a href="#outfits" className="text-link">
                Готовые образы <ArrowRight size={16} />
              </a>
            )}
          </div>
        </div>
        <div className="edit-hero-media">
          <span className="edit-hero-word" aria-hidden="true">
            {clothing ? 'WEAR' : 'MOVE'}
          </span>
          {heroProduct?.imageUrl && !heroImageFailed && (
            <Image
              src={
                clothing && heroProduct.brand === 'Puma'
                  ? heroProduct.imageUrl.replace(/w_2000,h_2000/, 'w_600,h_600')
                  : heroProduct.imageUrl
              }
              unoptimized={clothing && heroProduct.brand === 'Puma'}
              alt={heroProduct.name}
              fill
              preload
              sizes="(max-width: 760px) 40vw, 420px"
              onError={() => setHeroImageFailed(true)}
            />
          )}
          <span className="edit-hero-tag">
            {clothing ? 'СОБЕРИ СВОЙ ОБРАЗ' : 'ТВОЙ СЛЕДУЮЩИЙ ШАГ'}{' '}
            <span aria-hidden="true">✳</span>
          </span>
        </div>
      </section>
      <div className="benefits">
        <span>
          <Search size={17} />
          {brandsForSection.join(' + ')}
        </span>
        <span>
          <Clock3 size={17} />
          Обновления дважды в день
        </span>
        <span>
          <ShieldCheck size={17} />
          Заказ через WhatsApp
        </span>
      </div>
      <section id="catalog" ref={section} className="catalog-section">
        <div className="catalog-heading">
          <div>
            <span className="eyebrow">ТВОЯ СЛЕДУЮЩАЯ НАХОДКА</span>
            <h2>
              {clothing ? 'Собери свой образ' : 'Лови свою пару'}
              <span className="heading-dot">.</span>
            </h2>
          </div>
          {demoEnabled() && (
            <div className="catalog-mode" aria-label="Режим каталога">
              <button
                aria-pressed={mode === 'live'}
                className={mode === 'live' ? 'selected' : ''}
                onClick={() => {
                  setMode('live');
                  setFilters(defaults);
                }}
              >
                Предложения
              </button>
              <button
                aria-pressed={mode === 'demo'}
                className={mode === 'demo' ? 'selected' : ''}
                onClick={() => {
                  setMode('demo');
                  setFilters(defaults);
                }}
              >
                Демокаталог
              </button>
            </div>
          )}
        </div>
        {clothing && (
          <nav className="clothing-tabs" aria-label="Категория одежды">
            <Link href="/clothing" aria-current={department === 'sportswear' ? 'page' : undefined}>
              Спортивная <span>Nike · Puma · Reebok</span>
            </Link>
            <Link
              href="/clothing?department=casual"
              aria-current={department === 'casual' ? 'page' : undefined}
            >
              Повседневная <span>Uniqlo · Япония и Корея</span>
            </Link>
          </nav>
        )}
        <div className="quick-filters" aria-label="Быстрые фильтры">
          <div className="brand-switch" aria-label="Бренд">
            <button aria-pressed={!filters.brands.length} onClick={() => update('brands', [])}>
              {clothing ? 'Все товары' : 'Все пары'}
            </button>
            {brandsForSection.map((brand) => (
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
        {!clothing && (
          <div className="scenario-collections" role="group" aria-label="Подборки кроссовок">
            <span>Под твой день</span>
            <button aria-pressed={!filters.collection} onClick={() => update('collection', '')}>
              Все
            </button>
            {collections.map((item) => (
              <button
                key={item.id}
                aria-pressed={filters.collection === item.id}
                onClick={() => update('collection', filters.collection === item.id ? '' : item.id)}
              >
                {item.id === 'monochrome' && <span className="monochrome-dot" aria-hidden="true" />}
                {item.label}
              </button>
            ))}
          </div>
        )}
        {mode === 'demo' && (
          <div className="demo-notice">
            <span className="demo-pill">ДЕМО</span>
            <p>Знакомься с каталогом. Эти товары и цены — примеры, они недоступны для покупки.</p>
          </div>
        )}
        <div className="catalog-toolbar">
          <div className="search-field">
            <Search size={20} />
            <input
              aria-label={clothing ? 'Поиск одежды' : 'Поиск кроссовок'}
              placeholder={
                clothing ? 'Футболка, худи, брюки…' : 'Найди модель: Nano, NITRO, Classic…'
              }
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
            Фильтры{activeCount ? ` · ${activeCount}` : ''}
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
        {(activeCount > 0 || filters.q) && (
          <div className="active-filter-chips" aria-label="Выбранные фильтры">
            {filters.q && (
              <button onClick={() => update('q', '')}>
                Поиск: {filters.q} <X size={14} />
              </button>
            )}
            {filters.brands.map((v) => (
              <button key={v} onClick={() => toggle('brands', v)}>
                {v} <X size={14} />
              </button>
            ))}
            {filters.sizes.map((v) => (
              <button key={v} onClick={() => toggle('sizes', v)}>
                {clothing ? v : `EU ${v.replace(/^EU /, '')}`} <X size={14} />
              </button>
            ))}
            {filters.gender && (
              <button onClick={() => update('gender', '')}>
                {{ men: 'Мужские', women: 'Женские', unisex: 'Унисекс', kids: 'Детские' }[
                  filters.gender
                ] || filters.gender}{' '}
                <X size={14} />
              </button>
            )}
            {filters.category && (
              <button onClick={() => update('category', '')}>
                {filters.category} <X size={14} />
              </button>
            )}
            {filters.collection && (
              <button onClick={() => update('collection', '')}>
                {collections.find((c) => c.id === filters.collection)?.label} <X size={14} />
              </button>
            )}
            {filters.minDiscount > 0 && (
              <button onClick={() => update('minDiscount', 0)}>
                Скидка от {filters.minDiscount}% <X size={14} />
              </button>
            )}
            {(filters.minPrice > 0 || filters.maxPrice < 1000000) && (
              <button
                onClick={() =>
                  setFilters((f) => ({ ...f, minPrice: 0, maxPrice: 1000000, page: 1 }))
                }
              >
                {filters.minPrice > 0 ? `От ${formatKzt(filters.minPrice)}` : ''}
                {filters.maxPrice < 1000000 ? ` до ${formatKzt(filters.maxPrice)}` : ''}{' '}
                <X size={14} />
              </button>
            )}
            <button className="clear-chips" onClick={() => setFilters(defaults)}>
              Сбросить всё
            </button>
          </div>
        )}
        <div className="catalog-layout">
          <aside className="filters" aria-label="Фильтры каталога">
            {controls}
          </aside>
          <div className="catalog-results" aria-busy={loading}>
            <div className="results-heading">
              <span aria-live="polite">
                {loading
                  ? 'Ищем подходящие товары…'
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
                    : 'Пока ничего не нашлось'}
                </h3>
                <p>
                  {mode === 'live' && !activeCount && !filters.q
                    ? 'В этом разделе пока нет подтверждённых скидок. Каталог обновляется дважды в день — загляни позже.'
                    : 'Попробуй другой размер, бренд или чуть более широкий диапазон цен.'}
                </p>
                <div className="empty-actions">
                  <button
                    className="button dark"
                    onClick={() =>
                      demoEnabled() && mode === 'live' && !activeCount && !filters.q
                        ? setMode('demo')
                        : setFilters(defaults)
                    }
                  >
                    {demoEnabled() && mode === 'live' && !activeCount && !filters.q
                      ? 'Посмотреть демокаталог'
                      : 'Сбросить фильтры'}
                    <ArrowRight size={17} />
                  </button>
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
      {mode === 'live' && <OutfitCollections />}
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
          <h2 id="mobile-filters-title">Фильтры каталога</h2>
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
          <button className="filter-clear" onClick={() => setFilters(defaults)}>
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
