import type { Product } from './types';
export type AdminEntry = {
  product: Product;
  selling: Product;
  hidden: boolean;
  stale: boolean;
  archived: boolean;
};
export type OrderSelection = { id: string; size: string | null };
export function procurementQuery(items: { id: string; size: string }[]) {
  return items.map((i) => `${i.id}:${encodeURIComponent(i.size)}`).join('|');
}
export function readProcurementQuery(value: string): OrderSelection[] {
  if (value.length > 12000) throw Error('Список слишком длинный.');
  const rows = value
    .split('|')
    .filter(Boolean)
    .map((part) => {
      const colon = part.indexOf(':');
      const id = part.slice(0, colon),
        size = decodeURIComponent(part.slice(colon + 1));
      if (!/^[a-f0-9]{64}$/.test(id) || size.length > 20 || /[\r\n<>]/.test(size))
        throw Error('Некорректная ссылка заказа.');
      return { id, size };
    });
  if (rows.length > 50) throw Error('Не больше 50 позиций за один раз.');
  return rows;
}
export function parseWhatsappOrder(text: string): OrderSelection[] {
  if (text.length > 20000) throw Error('Заказ слишком длинный.');
  const result: OrderSelection[] = [];
  // Считываем явные коды, а не произвольные ссылки или команды из сообщения.
  const pattern = /Код товара:\s*([a-f0-9]{64})\b/gi;
  let match;
  let previous = 0;
  while ((match = pattern.exec(text))) {
    const block = text.slice(previous, match.index);
    const sizes = [...block.matchAll(/^Размер:\s*(.*?)\s*(?:·.*)?$/gm)];
    result.push({ id: match[1].toLowerCase(), size: sizes.at(-1)?.[1]?.trim() || null });
    previous = pattern.lastIndex;
  }
  if (!result.length)
    for (const id of text.match(/\b[a-f0-9]{64}\b/gi) || [])
      result.push({ id: id.toLowerCase(), size: null });
  const unique = [...new Map(result.map((i) => [JSON.stringify(i), i])).values()];
  if (!unique.length)
    throw Error(
      'В сообщении не найдены коды товаров. Скопируй заказ целиком или вставь код товара.',
    );
  if (unique.length > 50) throw Error('Не больше 50 позиций за один раз.');
  return unique;
}
export function matchesProcurement(entry: AdminEntry, query: string) {
  const p = entry.product;
  const terms = query.trim().toLocaleLowerCase('ru').split(/\s+/).filter(Boolean);
  const haystack = [
    p.name,
    p.usage,
    p.brand,
    p.sku,
    p.id,
    p.externalId,
    p.sourceName,
    p.color,
    p.category,
  ]
    .join(' ')
    .toLocaleLowerCase('ru');
  return terms.every((t) => haystack.includes(t));
}
