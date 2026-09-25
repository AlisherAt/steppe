'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Search, ArrowUpRight } from 'lucide-react';
import { catalogBrands as brandNames } from '@/lib/catalog-policy';
export function BrandDirectory({ available, error }: { available: string[]; error: boolean }) {
  const [query, setQuery] = useState('');
  const brands = [...new Set([...brandNames, ...available])]
    .sort((a, b) => a.localeCompare(b))
    .filter((b) => b.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <div className="search-field">
        <Search size={20} />
        <input
          aria-label="Поиск бренда"
          placeholder="Puma или Reebok"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <p className="small muted" style={{ marginTop: 16 }}>
        {brands.length} брендов ·{' '}
        {error
          ? 'Актуальность предложений временно не удалось проверить.'
          : 'Наличие определяется подключёнными магазинами.'}
      </p>
      <div className="brand-directory">
        {brands.map((b) => (
          <Link
            className="brand-tile"
            href={`/?mode=live&brands=${encodeURIComponent(b)}#catalog`}
            key={b}
          >
            <span className="brand-tile-name">{b}</span>
            <span className="brand-tile-status">
              {error
                ? 'Статус недоступен'
                : available.includes(b)
                  ? 'Есть предложения'
                  : 'Пока нет предложений'}
            </span>
            <ArrowUpRight size={18} />
          </Link>
        ))}
      </div>
      {!brands.length && (
        <div className="empty-state">
          <h2>Бренд не найден</h2>
          <p>Попробуй другое написание.</p>
        </div>
      )}
    </>
  );
}
