'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { uniqloSizeLabel } from '@/lib/uniqlo-labels.mjs';
import { sizeFilterLabel } from '@/lib/size-guide';

type Props = {
  clothing?: boolean;
  sizes: string[];
  groups?: { adults: string[]; kids: string[] };
  selected: string[];
  gender: string;
  onChange: (sizes: string[]) => void;
};
export function SizeFilter({ sizes, groups, selected, gender, onChange, clothing = false }: Props) {
  const label = (s: string) => (clothing ? uniqloSizeLabel(s) : sizeFilterLabel(s));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<'adults' | 'kids' | 'all'>('adults');
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setGroup(gender === 'kids' ? 'kids' : 'adults');
  }, [gender]);
  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);
  const normalize = (s: string) =>
    s
      .replace(/^EU\s*/i, '')
      .replace(',', '.')
      .trim()
      .toLowerCase();
  const pool = group === 'all' || !groups ? sizes : groups[group];
  const shown = pool.filter((s) => normalize(s).includes(normalize(query)));
  const toggle = (size: string) =>
    onChange(selected.includes(size) ? selected.filter((s) => s !== size) : [...selected, size]);
  return (
    <fieldset className="compact-size-filter">
      <legend>Размер {!clothing && <span className="muted">EU</span>}</legend>
      <button
        ref={trigger}
        type="button"
        className="size-filter-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span>{selected.length ? `Выбрано: ${selected.length}` : 'Выбрать размер'}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {selected.length > 0 && (
        <div className="size-filter-selection" aria-label="Выбранные размеры">
          {selected.map((size) => (
            <button
              type="button"
              key={size}
              onClick={() => toggle(size)}
              aria-label={`Убрать размер ${label(size)}`}
            >
              {label(size).replace(/^EU /, '')}
              <X size={13} aria-hidden="true" />
            </button>
          ))}
          <button type="button" className="size-filter-clear" onClick={() => onChange([])}>
            Сбросить размеры
          </button>
        </div>
      )}
      <div
        id={id}
        hidden={!open}
        className="size-filter-panel"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            trigger.current?.focus();
          }
        }}
      >
        <label className="size-filter-search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={search}
            type="search"
            aria-label={clothing ? 'Найти размер одежды' : 'Найти размер EU'}
            placeholder={clothing ? 'Например, M или 32' : 'Например, 38,5'}
            value={query}
            maxLength={20}
            onChange={(event) => {
              setQuery(event.target.value);
              if (event.target.value.trim()) setGroup('all');
            }}
          />
        </label>
        {groups && (
          <div className="size-filter-groups" role="group" aria-label="Группа размеров">
            {(['adults', 'kids', 'all'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={group === value}
                onClick={() => {
                  setGroup(value);
                  setQuery('');
                }}
              >
                {{ adults: 'Взрослые', kids: 'Детские', all: 'Все' }[value]}
              </button>
            ))}
          </div>
        )}
        <div
          className="size-filter-options"
          role="group"
          aria-label={clothing ? 'Доступные размеры одежды' : 'Доступные размеры EU'}
        >
          {shown.map((size) => (
            <button
              type="button"
              key={size}
              aria-label={label(size)}
              aria-pressed={selected.includes(size)}
              onClick={() => toggle(size)}
            >
              {label(size).replace(/^EU /, '')}
            </button>
          ))}
        </div>
        {!shown.length && (
          <p className="filter-hint" role="status">
            Размер не найден. Попробуйте другую группу или число.
          </p>
        )}
        <p className="filter-hint">Можно выбрать несколько размеров.</p>
      </div>
    </fieldset>
  );
}
