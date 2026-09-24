// Справочник распознавания, а не утверждение о партнёрстве или наличии товаров.
export const brandNames = [
  'Nike',
  'Adidas',
  'Jordan',
  'New Balance',
  'Puma',
  'Reebok',
  'ASICS',
  'Converse',
  'Vans',
  'Salomon',
  'HOKA',
  'On',
  'Saucony',
  'Brooks',
  'Mizuno',
  'Under Armour',
  'Skechers',
  'Fila',
  'Diadora',
  'Lotto',
  'Kappa',
  'Umbro',
  'DC Shoes',
  'Etnies',
  'Emerica',
  'Globe',
  'Osiris',
  'Supra',
  'Karhu',
  'KangaROOS',
  'Le Coq Sportif',
  'Lacoste',
  'VEJA',
  'Autry',
  'Axel Arigato',
  'Golden Goose',
  'Common Projects',
  'Merrell',
  'Columbia',
  'The North Face',
  'Timberland',
  'Caterpillar',
  'ECCO',
  'Geox',
  'Camper',
  'Clarks',
  'Superga',
  'Novesta',
  'Munich',
  'Li-Ning',
  'ANTA',
  '361°',
  'Xtep',
  'Peak',
  'Demix',
  'Joma',
  'Kelme',
  'K-Swiss',
  'Babolat',
  'Wilson',
  'Kiprun',
  'Kalenji',
  'Keen',
  'La Sportiva',
  'Scarpa',
  'Altra',
  'Inov-8',
  'NNormal',
  'Topo Athletic',
  'Palladium',
  'Sergio Tacchini',
  'Lumberjack',
  'D.A.T.E.',
  'Premiata',
  'Filling Pieces',
  'Flower Mountain',
  'Tretorn',
  'Gant',
] as const;
const key = (name: string) =>
  name
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]/gu, '');
const aliases: Record<string, string> = Object.fromEntries(
  brandNames.map((name) => [key(name), name]),
);
Object.assign(aliases, {
  adidasoriginals: 'Adidas',
  adidasperformance: 'Adidas',
  nikejordan: 'Jordan',
  airjordan: 'Jordan',
  jordanbrand: 'Jordan',
  newbalanceathletics: 'New Balance',
  nb: 'New Balance',
});
// Отдельные марки сохраняются отдельно от родительской компании.
Object.assign(aliases, {
  hokaoneone: 'HOKA',
  onrunning: 'On',
  oncloud: 'On',
  lining: 'Li-Ning',
  dc: 'DC Shoes',
  catfootwear: 'Caterpillar',
  thenorthface: 'The North Face',
  '361degrees': '361°',
});
export function normalizeBrand(value: string): string {
  const trimmed = value.trim();
  return aliases[key(trimmed)] || trimmed;
}
export function knownBrand(value: string): boolean {
  return Boolean(aliases[key(value)]);
}
export function brandInTitle(title: string): string | null {
  // Короткие неоднозначные слова (On, Peak, Globe) не угадываются по названию.
  const candidates = brandNames
    .filter((b) => !['On', 'Peak', 'Globe'].includes(b))
    .sort((a, b) => b.length - a.length);
  return (
    candidates.find((b) =>
      new RegExp(
        `(?:^|[^\\p{L}\\p{N}])${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^\\p{L}\\p{N}])`,
        'iu',
      ).test(title),
    ) || null
  );
}
