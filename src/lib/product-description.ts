import type { Product } from './types';
import { productPurpose } from './product-collections';

/** Краткое описание по данным карточки, без выдуманных материалов и технологий. */
export function productDescription(
  p: Pick<Product, 'name' | 'brand' | 'gender' | 'sizes'> &
    Partial<Pick<Product, 'category' | 'usage' | 'department'>>,
): string {
  if (p.department && p.department !== 'sneakers') {
    return `${p.category || 'Одежда'} ${p.brand}. Размеры производителя — выбери подходящий вариант.`;
  }
  const name = p.name.toLowerCase();
  const audience = { men: 'Мужские', women: 'Женские', kids: 'Детские', unisex: 'Унисекс' }[
    p.gender
  ];
  const purposes: [RegExp, string][] = [
    [/\btrail\b/, 'для бега по пересечённой местности'],
    [/\broad running\b/, 'для бега по дорогам'],
    [/\brunning\b/, 'для бега'],
    [/\btraining\b/, 'для тренировок'],
    [/\bwalking\b/, 'для ходьбы'],
    [/\bbasketball\b/, 'для баскетбола'],
    [/\btennis\b/, 'для тенниса'],
  ];
  const kind = productPurpose(p);
  const purpose =
    purposes.find(([pattern]) => pattern.test(name))?.[1] ||
    {
      daily: 'на каждый день',
      running: 'для бега',
      training: 'для тренировок',
      basketball: 'для баскетбола',
      '': '',
    }[kind];
  const opening = p.gender === 'unisex' ? 'Кроссовки унисекс' : `${audience} кроссовки`;
  const sentences = [`${opening} ${purpose || p.brand}.`];
  // Уточнения используются только когда сам магазин указал их в названии.
  if (/\bslip[ -]?on\b/.test(name)) sentences.push('Модель без шнуровки.');
  else if (/\bwide\b/.test(name)) sentences.push('Вариант с широкой колодкой.');
  else if (/\bretro\b/.test(name)) sentences.push('Дизайн в стиле ретро.');
  return sentences.join(' ');
}
