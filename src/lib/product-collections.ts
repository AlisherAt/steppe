import type { Product, Filters } from './types';

export const collections = [
  { id: 'daily', label: 'На каждый день' },
  { id: 'running', label: 'Для бега' },
  { id: 'training', label: 'Для тренировок' },
  { id: 'monochrome', label: 'Чёрные и белые' },
] as const;

type Details = Pick<Product, 'name'> & Partial<Pick<Product, 'category' | 'usage' | 'color'>>;
export function productPurpose(p: Details): 'running' | 'training' | 'daily' | 'basketball' | '' {
  const text = `${p.name} ${p.category || ''} ${p.usage || ''}`.toLowerCase();
  if (/\bbasketball\b|баскетбол/.test(text)) return 'basketball';
  if (/\brunning\b|\btrail\b|\broad[-_ ]running\b|для бега|беговые/.test(text)) return 'running';
  if (/\btraining\b|\bworkout\b|\bfitness\b|трениров/.test(text)) return 'training';
  if (
    /\blifestyle\b|\bcasual\b|\bwalking\b|\bsportswear\b|\bsportstyle\b|\bclassics?\b|повседнев|для ходьбы/.test(
      text,
    )
  )
    return 'daily';
  return '';
}
export function isMonochrome(color = ''): boolean {
  // Смешанные яркие расцветки не попадают сюда даже при наличии слова Black.
  const parts = color
    .toLowerCase()
    .replace(/puma|reebok|nike/g, '')
    .split(/[\s/,_-]+/)
    .filter(Boolean);
  const neutral = new Set([
    'black',
    'white',
    'grey',
    'gray',
    'silver',
    'pure',
    'off',
    'phantom',
    'sail',
    'chalk',
    'core',
    'ftwr',
    'cloud',
    'metallic',
    'platinum',
    'anthracite',
    'чёрный',
    'черный',
    'белый',
    'серый',
  ]);
  return (
    parts.some((p) => ['black', 'white', 'чёрный', 'черный', 'белый'].includes(p)) &&
    parts.every((p) => neutral.has(p))
  );
}
export function matchesCollection(p: Details, collection: Filters['collection']): boolean {
  return (
    !collection ||
    (collection === 'monochrome' ? isMonochrome(p.color) : productPurpose(p) === collection)
  );
}
