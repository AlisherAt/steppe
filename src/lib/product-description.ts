import type { Product } from './types';

/** Краткое описание по данным карточки, без выдуманных материалов и технологий. */
export function productDescription(
  p: Pick<Product, 'name' | 'brand' | 'gender' | 'sizes'>,
): string {
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
  const purpose = purposes.find(([pattern]) => pattern.test(name))?.[1];
  const opening = p.gender === 'unisex' ? 'Кроссовки унисекс' : `${audience} кроссовки`;
  const sentences = [`${opening} ${purpose || p.brand}.`];
  // Уточнения используются только когда сам магазин указал их в названии.
  if (/\bslip[ -]?on\b/.test(name)) sentences.push('Модель без шнуровки.');
  else if (/\bwide\b/.test(name)) sentences.push('Вариант с широкой колодкой.');
  else if (/\bretro\b/.test(name)) sentences.push('Дизайн в стиле ретро.');
  else if (!purpose && p.sizes.length) {
    const count = new Set(p.sizes).size;
    const word =
      count % 10 === 1 && count % 100 !== 11
        ? 'размер'
        : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)
          ? 'размера'
          : 'размеров';
    sentences.push(`В наличии ${count} ${word}.`);
  }
  return sentences.join(' ');
}
