'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Link2, Plus, Trash2, RotateCcw, Check, Package } from 'lucide-react';
import type { Product } from '@/lib/types';
import { formatDate, formatKzt } from '@/lib/money';
import { localSizeLabel } from '@/lib/size-guide';
import './admin.css';

type Draft = { draftId: string; product: Product; selling: Product; from?: string };
type Entry = {
  product: Product;
  selling: Product;
  hidden: boolean;
  stale: boolean;
  manual: boolean;
};
export default function AdminPage() {
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [url, setUrl] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [gender, setGender] = useState<Product['gender']>('unisex');
  const [selected, setSelected] = useState<number[]>([]);
  const [sizes, setSizes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [query, setQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);

  async function api(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(path, {
      method,
      cache: 'no-store',
      ...(body
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) setDenied(data.error);
      throw Error(data.error || 'Не удалось выполнить действие.');
    }
    return data;
  }
  async function reload() {
    const data = await api('/api/admin/products');
    setEntries(data.products);
    setDrafts(data.drafts);
    setReady(true);
  }
  useEffect(() => {
    reload().catch((e) => {
      setError(e.message);
      setReady(true);
    });
  }, []);
  function openDraft(value: Draft) {
    setDraft(value);
    setName(value.product.name);
    setBrand(value.product.brand);
    setGender(value.product.gender);
    setSelected(value.product.sizes.map((_, i) => i));
    setSizes('');
    setConfirmed(false);
    setError('');
    setNotice('');
  }
  async function importLink(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = await api('/api/admin/import', 'POST', { url });
      openDraft(data);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось прочитать ссылку.');
    } finally {
      setBusy(false);
    }
  }
  async function publish(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError('');
    const unresolved = draft.product.sizePrices?.length === 1 && !draft.product.sizes[0];
    const selections = unresolved
      ? sizes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((size) => ({ index: 0, size }))
      : selected.map((index) => ({ index, size: draft.product.sizes[index] }));
    try {
      await api('/api/admin/products', 'POST', {
        draftId: draft.draftId,
        name,
        brand,
        gender,
        selections,
        confirmed,
      });
      setDraft(null);
      setUrl('');
      await reload();
      setNotice('Товар опубликован. Он уже доступен в каталоге.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось опубликовать товар.');
    } finally {
      setBusy(false);
    }
  }
  async function toggle(entry: Entry) {
    if (
      !entry.hidden &&
      !window.confirm(
        `Удалить «${entry.product.name}» из каталога? Автосбор не вернёт его. Товар можно восстановить здесь.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/api/admin/products', 'DELETE', { id: entry.product.id, restore: entry.hidden });
      await reload();
      setNotice(entry.hidden ? 'Товар восстановлен.' : 'Товар удалён из каталога.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось изменить товар.');
    } finally {
      setBusy(false);
    }
  }
  async function discard(value: Draft) {
    setBusy(true);
    setError('');
    try {
      await api('/api/admin/products', 'POST', { action: 'discard', draftId: value.draftId });
      if (draft?.draftId === value.draftId) setDraft(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить черновик.');
    } finally {
      setBusy(false);
    }
  }
  if (!ready && !denied)
    return (
      <main id="main-content" className="admin-page">
        <p role="status">Проверяем доступ…</p>
      </main>
    );
  if (denied)
    return (
      <main id="main-content" className="admin-page">
        <div className="admin-empty">
          <Package size={38} />
          <h1>Управление каталогом</h1>
          <p>{denied}</p>
          <Link href="/login" className="button dark">
            Перейти к входу
          </Link>
        </div>
      </main>
    );
  const list = entries.filter(
    (e) =>
      e.hidden === showHidden &&
      `${e.product.name} ${e.product.brand} ${e.product.sku || ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <main id="main-content" className="admin-page">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">STEPPE / УПРАВЛЕНИЕ</p>
          <h1>Твой каталог.</h1>
          <p>Добавляй новые пары и управляй тем, что видят покупатели.</p>
        </div>
        <Link href="/" className="button outline">
          Открыть витрину <ArrowUpRight size={18} />
        </Link>
      </header>
      <div className="admin-pricing">
        <span>
          <Check size={18} /> Цена рассчитывается автоматически
        </span>
        <strong>До 20 000 ₸: +3 000 ₸</strong>
        <strong>От 20 000 ₸: +12%</strong>
        <small>
          Для каждого размера после перевода закупочной цены в тенге. Округление до целого тенге.
        </small>
      </div>
      {error && (
        <p role="alert" className="admin-alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="admin-success">
          {notice}
        </p>
      )}
      <section className="admin-import" aria-labelledby="import-title">
        <div>
          <span className="admin-step">01</span>
          <h2 id="import-title">Добавить по ссылке</h2>
          <p>
            Вставь ссылку на товар. Мы попробуем получить фото, размеры и закупочные цены — перед
            публикацией ты проверишь результат.
          </p>
        </div>
        <form onSubmit={importLink}>
          <label htmlFor="product-link">Ссылка на товар магазина</label>
          <div className="admin-url-row">
            <Link2 size={20} />
            <input
              id="product-link"
              type="url"
              required
              maxLength={2000}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.fila.de/…"
              disabled={busy}
            />
            <button className="button dark" disabled={busy}>
              {busy ? 'Подождите…' : 'Получить данные'}
              <Plus size={18} />
            </button>
          </div>
          <small>
            Поддерживаются официальные магазины из списка источников. Блокировки магазина могут
            помешать заполнению.
          </small>
        </form>
      </section>
      {draft && (
        <section className="admin-draft" aria-labelledby="draft-title">
          <div className="admin-preview">
            {draft.product.imageUrl ? (
              <Image
                src={draft.product.imageUrl}
                alt={draft.product.name}
                width={520}
                height={400}
              />
            ) : (
              <Package size={64} />
            )}
            <p>{draft.from || 'Сохранённый черновик'}</p>
            <a href={draft.product.productUrl} target="_blank" rel="noreferrer">
              Проверить в магазине <ArrowUpRight size={16} />
            </a>
            <small>
              Цена проверена {formatDate(draft.product.sourceUpdatedAt || draft.product.updatedAt)}{' '}
              · Алматы
            </small>
          </div>
          <form onSubmit={publish}>
            <span className="admin-step">02</span>
            <h2 id="draft-title">Проверь и опубликуй</h2>
            <div className="admin-fields">
              <label>
                Название
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={180}
                />
              </label>
              <label>
                Бренд
                <input
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  required
                  maxLength={80}
                />
              </label>
              <label>
                Категория
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as Product['gender'])}
                >
                  <option value="unisex">Унисекс</option>
                  <option value="men">Мужские</option>
                  <option value="women">Женские</option>
                  <option value="kids">Детские</option>
                </select>
              </label>
            </div>
            <fieldset className="admin-variants">
              <legend>Размеры и цены</legend>
              <div className="admin-variant-head">
                <span>Публиковать</span>
                <span>Закупка, ₸</span>
                <span>На сайте, ₸</span>
              </div>
              {draft.product.sizePrices?.map((v, index) => (
                <label key={index} className="admin-variant">
                  <span>
                    <input
                      type="checkbox"
                      checked={selected.includes(index)}
                      disabled={!v.size || busy}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, index]
                            : selected.filter((i) => i !== index),
                        )
                      }
                    />
                    {v.size
                      ? `${localSizeLabel(draft.product, v.size)} (${v.size})`
                      : 'Цена со страницы'}
                  </span>
                  <span>{formatKzt(v.saleKzt)}</span>
                  <strong>{formatKzt(draft.selling.sizePrices![index].saleKzt)}</strong>
                </label>
              ))}
              {draft.product.sizePrices?.length === 1 && !draft.product.sizes[0] && (
                <label className="admin-size-input">
                  Размеры, для которых ты подтвердил эту цену
                  <input
                    value={sizes}
                    onChange={(e) => setSizes(e.target.value)}
                    required
                    placeholder="EU 41, EU 42, EU 43"
                    maxLength={1000}
                  />
                  <small>
                    Страница не указала размеры. Заполни их после проверки наличия и одинаковой цены
                    каждого варианта. Укажи систему EU или US.
                  </small>
                </label>
              )}
            </fieldset>
            <label className="admin-confirm">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Я проверил фото, название, наличие выбранных размеров и их закупочные цены в магазине.
            </label>
            <p className="admin-note">
              Цена продажи рассчитывается сервером. Данные старше 36 часов скрываются до новой
              проверки.
            </p>
            <div className="admin-actions">
              <button className="button dark" disabled={busy || !confirmed || !selected.length}>
                Опубликовать <ArrowUpRight size={18} />
              </button>
              <button
                type="button"
                className="button outline"
                onClick={() => setDraft(null)}
                disabled={busy}
              >
                Продолжить позже
              </button>
            </div>
          </form>
        </section>
      )}
      {drafts.length > 0 && (
        <section className="admin-saved">
          <h2>
            Черновики <span>{drafts.length}</span>
          </h2>
          <div>
            {drafts.map((d) => (
              <div key={d.draftId}>
                <button disabled={busy} onClick={() => openDraft(d)}>
                  {d.product.brand} · {d.product.name}
                </button>
                <button
                  className="icon-button"
                  aria-label={`Удалить черновик ${d.product.name}`}
                  disabled={busy}
                  onClick={() => discard(d)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="admin-catalog">
        <div className="admin-list-heading">
          <h2>
            Товары <span>{list.length}</span>
          </h2>
          <div className="admin-tabs">
            <button aria-pressed={!showHidden} onClick={() => setShowHidden(false)}>
              В каталоге
            </button>
            <button aria-pressed={showHidden} onClick={() => setShowHidden(true)}>
              Удалённые
            </button>
          </div>
        </div>
        <label className="sr-only" htmlFor="admin-search">
          Поиск товара
        </label>
        <input
          id="admin-search"
          className="admin-search"
          placeholder="Поиск по названию, бренду или артикулу"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!list.length ? (
          <div className="admin-empty">
            <Package size={34} />
            <p>
              {query
                ? 'Ничего не найдено. Попробуй другой запрос.'
                : showHidden
                  ? 'Удалённых товаров нет.'
                  : 'Добавь первый товар по ссылке выше.'}
            </p>
          </div>
        ) : (
          <div className="admin-products">
            {list.map((entry) => (
              <article className="admin-product" key={entry.product.id}>
                <div className="admin-thumb">
                  {entry.product.imageUrl ? (
                    <Image src={entry.product.imageUrl} alt="" width={100} height={90} />
                  ) : (
                    <Package />
                  )}
                </div>
                <div className="admin-product-copy">
                  <p>
                    {entry.product.brand} ·{' '}
                    {entry.manual ? 'Добавлен вручную' : 'Автоматический сбор'}
                    {entry.stale ? ' · Цена устарела' : ''}
                  </p>
                  <h3>{entry.product.name}</h3>
                  <small>
                    {entry.product.sizes.map((s) => localSizeLabel(entry.product, s)).join(' · ')}
                  </small>
                </div>
                <strong>{formatKzt(entry.selling.saleKzt)}</strong>
                <button
                  className="admin-delete"
                  onClick={() => toggle(entry)}
                  disabled={busy}
                  aria-label={`${entry.hidden ? 'Восстановить' : 'Удалить'} ${entry.product.name}`}
                >
                  {entry.hidden ? <RotateCcw size={19} /> : <Trash2 size={19} />}
                  <span>{entry.hidden ? 'Восстановить' : 'Удалить'}</span>
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
