import type { SeaRow } from './seatable-client';
import { IntegrationError } from './http';

// Выбираем один проверенный снимок магазина. Не объединяем старые размеры
// с новыми и не обновляем время наблюдения при повторном импорте.
export function selectScrapeSnapshot<T extends { id: string; sourceUpdatedAt?: string }>(
  rows: SeaRow[],
  source: string,
  convert: (raw: unknown, now: number) => T | null,
  now = Date.now(),
): T[] | null {
  const fresh = (time: number) =>
    Number.isFinite(time) && time <= now + 60000 && now - time <= 36 * 3600000;
  const decoded = rows.flatMap((row) => {
    try {
      return [{ row, data: JSON.parse(String(row.payload)) }];
    } catch {
      return [];
    }
  });
  const candidates: { id: string; observedAt: number; products: T[] }[] = [];
  for (const { row, data } of decoded) {
    const id = String(row.id);
    if (id.includes(':') || !fresh(Date.parse(String(row.checked_at)))) continue;
    const status = Array.isArray(data?.reports)
      ? data.reports.find((r: { source: string }) => r?.source === source)?.status
      : null;
    if (!['partial', 'finished_observed_pages'].includes(status)) continue;
    const products = decoded.flatMap((item) => {
      if (!String(item.row.id).startsWith(`${id}:`) || item.data?.source !== source) return [];
      const product = convert(item.data, now);
      return product ? [product] : [];
    });
    if (!products.length) continue;
    if (new Set(products.map((p) => p.id)).size !== products.length)
      throw new IntegrationError('DUPLICATE_SCRAPE_SNAPSHOT');
    // Время цен, а не время загрузки отчёта: медленная отправка не делает данные новее.
    const observedAt = Math.min(...products.map((p) => Date.parse(p.sourceUpdatedAt || '')));
    if (fresh(observedAt)) candidates.push({ id, observedAt, products });
  }
  candidates.sort((a, b) => b.observedAt - a.observedAt || a.id.localeCompare(b.id));
  return candidates[0]?.products ?? null;
}
