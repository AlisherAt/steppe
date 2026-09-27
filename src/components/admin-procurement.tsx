'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Search,
  ArrowUpRight,
  Copy,
  Package,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { formatDate, formatKzt } from '@/lib/money';
import { localSizeLabel } from '@/lib/size-guide';
import { readProcurementQuery, type AdminEntry } from '@/lib/procurement';

type OrderRow = {
  id: string;
  requestedSize: string | null;
  size: string | null;
  sizeUnavailable: boolean;
  entry: AdminEntry | null;
};
type Result = {
  products: AdminEntry[];
  total: number;
  page: number;
  pages: number;
  sources: { id: string; name: string }[];
};
async function json(path: string, body?: unknown, signal?: AbortSignal) {
  const r = await fetch(path, {
    cache: 'no-store',
    signal,
    ...(body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || 'Не удалось получить товары.');
  return d;
}
export function AdminProcurement() {
  const [query, setQuery] = useState(''),
    [source, setSource] = useState(''),
    [department, setDepartment] = useState(''),
    [state, setState] = useState('all'),
    [page, setPage] = useState(1),
    [retry, setRetry] = useState(0);
  const [data, setData] = useState<Result | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [text, setText] = useState(''),
    [order, setOrder] = useState<OrderRow[]>([]),
    [orderBusy, setOrderBusy] = useState(false),
    [orderError, setOrderError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      json(
        '/api/admin/catalog?' +
          new URLSearchParams({ q: query, source, department, state, page: String(page) }),
        undefined,
        controller.signal,
      )
        .then(setData)
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, source, department, state, page, retry]);
  useEffect(() => {
    const encoded = new URLSearchParams(location.search).get('items');
    if (!encoded) return;
    const controller = new AbortController();
    setOrderBusy(true);
    try {
      const items = readProcurementQuery(encoded);
      json('/api/admin/catalog', { items }, controller.signal)
        .then((d) => setOrder(d.items))
        .catch((e) => {
          if (!controller.signal.aborted) setOrderError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setOrderBusy(false);
        });
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : 'Некорректный заказ.');
      setOrderBusy(false);
    }
    return () => controller.abort();
  }, []);
  async function resolveOrder() {
    setOrderBusy(true);
    setOrderError('');
    try {
      const d = await json('/api/admin/catalog', { text });
      setOrder(d.items);
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : 'Не удалось прочитать заказ.');
    } finally {
      setOrderBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice('Скопировано.');
    } catch {
      setNotice('Не удалось скопировать. Выдели текст или открой ссылку вручную.');
    }
  }
  function clearOrder() {
    setOrder([]);
    setText('');
    setOrderError('');
    history.replaceState(null, '', '/admin');
  }
  const purchaseCard = (entry: AdminEntry, requested?: string | null, orderKey?: string) => (
    <ProcurementCard
      key={orderKey || entry.product.id}
      entry={entry}
      requested={requested}
      copy={copy}
    />
  );
  return (
    <main id="main-content" className="admin-page procurement-page">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">STEPPE / ДЛЯ ПРОДАВЦА</p>
          <h1>Найти. Проверить. Выкупить.</h1>
          <p>Все кроссовки и одежда, закупочные цены и прямые ссылки на магазины.</p>
        </div>
        <Link className="button outline" href="/">
          На витрину <ArrowUpRight size={18} />
        </Link>
      </header>
      <section className="purchase-order" aria-labelledby="purchase-order-title">
        <div>
          <span className="eyebrow">ЗАКАЗ ИЗ WHATSAPP</span>
          <h2 id="purchase-order-title">Клиент уже выбрал?</h2>
          <p>
            Вставь сообщение целиком — найдём каждую позицию по коду. Ссылка «Заказ в STEPPE» из
            новых сообщений открывает этот список сразу.
          </p>
        </div>
        <label htmlFor="whatsapp-paste" className="sr-only">
          Текст заказа из WhatsApp
        </label>
        <textarea
          id="whatsapp-paste"
          value={text}
          maxLength={20000}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Здравствуйте! Хочу оформить заказ…\nКод товара: …'}
          rows={4}
        />
        <div className="purchase-order-actions">
          <button
            className="button dark"
            onClick={resolveOrder}
            disabled={orderBusy || !text.trim()}
          >
            {orderBusy ? 'Ищем позиции…' : 'Найти товары из заказа'}
          </button>
          {(order.length > 0 || text) && (
            <button className="button outline" onClick={clearOrder}>
              Очистить
            </button>
          )}
          {order.some((v) => v.entry?.product.productUrl) && (
            <button
              className="button outline"
              onClick={() =>
                copy(
                  order
                    .filter((v) => v.entry?.product.productUrl)
                    .map(
                      (v) =>
                        `${v.entry!.product.name}\nРазмер: ${v.requestedSize || 'уточнить'}\n${v.entry!.product.productUrl}`,
                    )
                    .join('\n\n'),
                )
              }
            >
              <Copy size={16} />
              Копировать список ссылок
            </button>
          )}
        </div>
        {orderError && (
          <p role="alert" className="admin-alert">
            {orderError}
          </p>
        )}
        {orderBusy && <p role="status">Проверяем товары заказа…</p>}
      </section>
      {notice && (
        <p className="admin-success" role="status">
          {notice}
        </p>
      )}
      {order.length > 0 && (
        <section className="purchase-order-results" aria-label="Товары заказа">
          <h2>К выкупу · {order.length}</h2>
          <div className="procurement-grid">
            {order.map((row, i) =>
              row.entry ? (
                purchaseCard(row.entry, row.requestedSize, `${row.id}-${i}`)
              ) : (
                <article className="procurement-card" key={`${row.id}-${i}`}>
                  <h3>Товар не найден</h3>
                  <code>{row.id}</code>
                  <p>
                    Его нет в текущем каталоге и архиве. Уточни название у клиента и проверь
                    магазин; ссылка не подставляется автоматически.
                  </p>
                </article>
              ),
            )}
          </div>
        </section>
      )}
      <section aria-labelledby="procurement-search-title">
        <h2 id="procurement-search-title">Поиск по всему каталогу</h2>
        <div className="procurement-controls">
          <label className="procurement-search">
            <Search size={20} />
            <span className="sr-only">Название, артикул или код товара</span>
            <input
              value={query}
              maxLength={500}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Название, артикул, цвет или код из WhatsApp"
            />
          </label>
          <label>
            Раздел
            <select
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Все товары</option>
              <option value="sneakers">Кроссовки</option>
              <option value="sportswear">Спортивная одежда</option>
              <option value="casual">Uniqlo</option>
            </select>
          </label>
          <label>
            Магазин
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Все магазины</option>
              {data?.sources.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Состояние
            <select
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Все, включая архив</option>
              <option value="active">На витрине</option>
              <option value="stale">Нужна проверка цены</option>
              <option value="hidden">Скрытые</option>
              <option value="archived">Убраны магазином</option>
            </select>
          </label>
        </div>
        <div className="procurement-result-heading">
          <p role="status">{loading ? 'Загружаем товары…' : `Найдено: ${data?.total || 0}`}</p>
          <button
            className="button outline"
            onClick={() => setRetry((n) => n + 1)}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Обновить
          </button>
        </div>
        {error ? (
          <p className="admin-alert" role="alert">
            {error} <Link href="/login?next=/admin">Войти в аккаунт</Link>
          </p>
        ) : (
          <div aria-busy={loading} className="procurement-grid">
            {data?.products.map((e) => purchaseCard(e))}
          </div>
        )}
        {!loading && !error && data?.total === 0 && (
          <div className="admin-empty">
            <Package size={32} />
            <p>Ничего не найдено. Попробуй артикул или код товара из сообщения.</p>
          </div>
        )}
        {data && data.pages > 1 && (
          <nav className="procurement-pagination" aria-label="Страницы товаров">
            <button
              className="button outline"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={18} />
              Назад
            </button>
            <span>
              {page} / {data.pages}
            </span>
            <button
              className="button outline"
              disabled={loading || page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Далее
              <ChevronRight size={18} />
            </button>
          </nav>
        )}
      </section>
      <p className="small muted">
        Ссылки и закупочные цены доступны только администратору. Перед выкупом проверь цену и
        наличие выбранного размера в магазине. Заказ на этой странице не оформляет покупку
        автоматически.
      </p>
    </main>
  );
}
function ProcurementCard({
  entry,
  requested,
  copy,
}: {
  entry: AdminEntry;
  requested?: string | null;
  copy: (value: string) => Promise<void>;
}) {
  const p = entry.product;
  const initial = p.sizes.find((s) => s === requested || localSizeLabel(p, s) === requested) || '';
  const [size, setSize] = useState(initial);
  useEffect(() => setSize(initial), [initial]);
  const cost = p.sizePrices?.find((v) => v.size === size),
    selling = entry.selling.sizePrices?.find((v) => v.size === size);
  const unavailable = Boolean(requested && !initial);
  return (
    <article className="procurement-card">
      <div className="procurement-card-top">
        <div className="procurement-photo">
          {p.imageUrl ? (
            <Image
              src={
                p.brand === 'Puma' ? p.imageUrl.replace(/w_2000,h_2000/, 'w_600,h_600') : p.imageUrl
              }
              alt={p.name}
              width={160}
              height={160}
              unoptimized
            />
          ) : (
            <Package />
          )}
        </div>
        <div>
          <p className="eyebrow">
            {p.sourceName} · {p.market}
          </p>
          <h3>{p.name}</h3>
          {p.color && <p>{p.color}</p>}
          <small>Артикул: {p.sku || p.externalId}</small>
        </div>
      </div>
      {p.brand === 'Uniqlo' && p.usage && (
        <p className="procurement-original">В магазине: {p.usage}</p>
      )}
      {(entry.archived || entry.stale || entry.hidden) && (
        <p className="procurement-warning">
          {entry.archived
            ? 'Архив — товар убран из последней выгрузки.'
            : entry.hidden
              ? 'Товар скрыт с витрины.'
              : 'Цена требует проверки.'}{' '}
          Проверь наличие в магазине.
        </p>
      )}
      {requested && (
        <p className="procurement-requested">
          Заказан размер: <strong>{initial ? localSizeLabel(p, initial) : requested}</strong>
          {unavailable ? ' · в текущем наличии не подтверждён' : ''}
        </p>
      )}
      <label className="procurement-size">
        Размер для выкупа
        <select value={size} onChange={(e) => setSize(e.target.value)}>
          <option value="">Выбрать размер</option>
          {p.sizes.map((s) => (
            <option value={s} key={s}>
              {localSizeLabel(p, s)}
              {localSizeLabel(p, s) !== s ? ` (${s})` : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="procurement-prices">
        <div>
          <span>{cost ? 'Закупка' : 'Закупка от'}</span>
          <strong>
            {new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(
              Number(cost?.salePrice || p.salePrice),
            )}{' '}
            {p.currency}
          </strong>
          <small>≈ {formatKzt(cost?.saleKzt ?? p.saleKzt)}</small>
        </div>
        <div>
          <span>На сайте{selling ? '' : ' от'}</span>
          <strong>{formatKzt(selling?.saleKzt ?? entry.selling.saleKzt)}</strong>
          <small>Наценка уже включена</small>
        </div>
      </div>
      <p className="procurement-date">
        Проверено {formatDate(p.sourceUpdatedAt || p.updatedAt)} · Алматы
      </p>
      <div className="procurement-actions">
        {p.productUrl ? (
          <>
            <a
              className="button dark"
              href={p.productUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Открыть в магазине
              <ArrowUpRight size={17} />
            </a>
            <button
              className="button outline"
              aria-label={`Копировать ссылку: ${p.name}`}
              onClick={() => copy(p.productUrl)}
            >
              <Copy size={17} />
            </button>
          </>
        ) : (
          <p>Проверенная ссылка недоступна.</p>
        )}
        <button className="procurement-code" onClick={() => copy(p.id)}>
          Копировать код товара
        </button>
      </div>
    </article>
  );
}
