'use client';

import { useId, useRef } from 'react';
import { Check, Ruler, X } from 'lucide-react';
import type { Product } from '@/lib/types';
import { sizeGuideRows } from '@/lib/size-guide';
import { sizeLabel } from '@/lib/official-stores';

const number = (value?: number) => (value === undefined ? '—' : String(value).replace('.', ','));

export function SizeGuide({
  product,
  selected,
  onSelect,
}: {
  product: Product;
  selected: string;
  onSelect: (size: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const rows = sizeGuideRows(product);
  const hasConversions = rows.some((r) => r.cm !== undefined);
  return (
    <>
      <button
        type="button"
        className="size-guide-trigger"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <Ruler size={16} aria-hidden="true" /> Таблица размеров
      </button>
      <dialog
        ref={dialog}
        className="size-guide-dialog"
        aria-labelledby={id}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className="dialog-header">
          <span className="eyebrow">НАЙДИ СВОЮ ПОСАДКУ · {product.brand}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Закрыть таблицу размеров"
            onClick={() => dialog.current?.close()}
          >
            <X />
          </button>
        </div>
        <h2 id={id}>Твой размер — без путаницы</h2>
        <p className="size-guide-model">{product.name}</p>
        <p>
          Привыкли выбирать обувь в Казахстане? Сначала проверьте, какой размер указан на вашей
          паре: <strong>EU или RU</strong>. Это разные обозначения.
        </p>
        {hasConversions ? (
          <p className="size-guide-note">
            <strong>RU ≈</strong> — приблизительный ориентир (EU − 1), а не отдельный стандарт KZ.{' '}
            <strong>CM</strong> — маркировка в сантиметрах из таблицы бренда, не измеренная длина
            стельки. M — мужская сетка US, W — женская. У отдельных моделей посадка и сетка могут
            отличаться.
          </p>
        ) : (
          <p className="size-guide-note">
            Для этих размеров нет однозначного соответствия в нашем справочнике. Особенно у детской
            обуви один номер US может означать разные размеры. Уточните сетку модели при оформлении
            заказа.
          </p>
        )}
        {rows.length > 0 ? (
          <div
            className="size-guide-scroll"
            tabIndex={0}
            role="region"
            aria-label="Соответствие доступных размеров"
          >
            <table className="size-guide-table">
              <caption>Доступные размеры этой пары · нажмите «Выбрать»</caption>
              <thead>
                <tr>
                  <th scope="col">EU</th>
                  <th scope="col">RU ≈</th>
                  <th scope="col">US</th>
                  <th scope="col">CM</th>
                  <th scope="col">Выбор</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.native}
                    className={row.native === selected ? 'is-selected' : undefined}
                  >
                    <td>
                      <strong>{number(row.eu)}</strong>
                    </td>
                    <td>{number(row.ru)}</td>
                    <td>{row.us?.replace(/^US /, '') || '—'}</td>
                    <td>{number(row.cm)}</td>
                    <td>
                      <button
                        type="button"
                        aria-label={`Выбрать ${sizeLabel(row.native)}`}
                        aria-pressed={row.native === selected}
                        onClick={() => {
                          onSelect(row.native);
                          dialog.current?.close();
                        }}
                      >
                        {row.native === selected ? (
                          <>
                            <Check size={14} aria-hidden="true" /> Выбран
                          </>
                        ) : (
                          'Выбрать'
                        )}
                        <small>{sizeLabel(row.native)}</small>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Магазин пока не передал доступные размеры.</p>
        )}
        {hasConversions && rows.some((r) => r.cm === undefined) && (
          <p className="size-guide-note">
            Прочерк означает, что соответствие не подтверждено. Исходный размер указан на кнопке
            выбора.
          </p>
        )}
        <details className="size-guide-measure">
          <summary>Как измерить стопу дома</summary>
          <ol>
            <li>Встаньте на лист бумаги, поставив пятку к стене.</li>
            <li>
              Отметьте кончик самого длинного пальца и измерьте расстояние от стены в сантиметрах.
            </li>
            <li>
              Измерьте обе стопы и возьмите большее значение. Передайте его при оформлении, если
              сомневаетесь в размере.
            </li>
          </ol>
          <p>
            Длина стопы и маркировка CM могут отличаться. Не прибавляйте запас автоматически; для
            подбора по длине нужна сетка конкретной модели.
          </p>
        </details>
        <p className="size-guide-caption">
          Справочник {product.brand} · в заказ попадёт исходный размер выбранной пары.
        </p>
      </dialog>
    </>
  );
}
