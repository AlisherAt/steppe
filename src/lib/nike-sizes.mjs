// Официальные таблицы Nike, проверены 26.09.2026:
// https://www.nike.com/size-fit/mens-footwear
// https://www.nike.com/size-fit/womens-footwear
// https://www.nike.com/size-fit/kids-footwear
const men = [
  35.5, 36, 36.5, 37.5, 38, 38.5, 39, 40, 40.5, 41, 42, 42.5, 43, 44, 44.5, 45, 45.5, 46, 47, 47.5,
  48, 48.5, 49, 49.5, 50, 50.5, 51, 51.5, 52, 52.5, 53, 53.5, 54, 54.5, 55, 55.5, 56, 56.5,
];
const women = [
  33.5, 34.5, 35, 35.5, 36, 36.5, 37.5, 38, 38.5, 39, 40, 40.5, 41, 42, 42.5, 43, 44, 44.5, 45,
  45.5, 46, 47, 47.5, 48, 48.5, 49, 50, 50.5, 51, 51.5, 52, 52.5, 53, 53.5, 54, 54.5, 55, 55.5, 56,
];
const youth = [32, 33, 33.5, 34, 35, 35.5, 36, 36.5, 37.5, 38, 38.5, 39, 40];
const children = {
  1: 16,
  2: 17,
  3: 18.5,
  4: 19.5,
  5: 21,
  6: 22,
  7: 23.5,
  8: 25,
  9: 26,
  10: 27,
  10.5: 27.5,
  11: 28,
  11.5: 28.5,
  12: 29.5,
  12.5: 30,
  13: 31,
  13.5: 31.5,
};
export function nikeEuSize(label, subtitle = '') {
  const text = String(label).trim();
  const child = /^(\d+(?:\.\d+)?)([CY])$/.exec(text);
  if (child) return child[2] === 'C' ? children[child[1]] : youth[(Number(child[1]) - 1) * 2];
  const marked = /^(W|M)\s+(\d+(?:\.\d+)?)(?:\s*\/\s*[MW]\s+\d+(?:\.\d+)?)?$/.exec(text);
  const value = marked ? Number(marked[2]) : /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
  const system =
    marked?.[1] || (/women/i.test(subtitle) ? 'W' : /\bmen/i.test(subtitle) ? 'M' : '');
  return system === 'W'
    ? women[(value - 3.5) * 2]
    : system === 'M'
      ? men[(value - 3.5) * 2]
      : undefined;
}
