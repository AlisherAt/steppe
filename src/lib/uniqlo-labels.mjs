// Названия выводятся из исходного JP/KR текста. Общие breadcrumbs — только запасной вариант.
const kinds = [
  [/ダウンベスト|다운베스트|down vest/i, 'Пуховый жилет', 'Жилеты'],
  [/フリース.*パンツ|후리스.*팬츠|fleece.*pants/i, 'Флисовые брюки', 'Брюки и джинсы'],
  [
    /フリース.*ジャケット|후리스.*재킷|fleece.*jacket/i,
    'Флисовая куртка',
    'Куртки и верхняя одежда',
  ],
  [/スコート|스코츠|skort/i, 'Юбка-шорты', 'Платья и юбки'],
  [/パジャマ|파자마|pajama|pyjama/i, 'Пижама', 'Домашняя одежда'],
  [/ボディ|바디수트|ショートオール|shortall|bodysuit/i, 'Боди', 'Боди и комбинезоны'],
  [/オールインワン|ジャンプスーツ|점프수트|jumpsuit/i, 'Комбинезон', 'Боди и комбинезоны'],
  [/ワンピース|원피스|\bdress\b/i, 'Платье', 'Платья и юбки'],
  [/スカート|스커트|\bskirt\b/i, 'Юбка', 'Платья и юбки'],
  [/シャツジャケット|셔츠재킷|shirt jacket/i, 'Куртка-рубашка', 'Куртки и верхняя одежда'],
  [
    /ウール.*ジャケット|ストレッチジャケット|感動ジャケット|テーラード|コンフォート.*ジャケット|울.*재킷|컴포트.*재킷|감탄재킷|테일러드|blazer|suit jacket|tailored/i,
    'Пиджак',
    'Пиджаки',
  ],
  [/リネン.*ジャケット|린넨.*재킷|리넨.*재킷|linen.*jacket/i, 'Пиджак', 'Пиджаки'],
  [/ダウンコート|다운코트|down coat/i, 'Пуховое пальто', 'Куртки и верхняя одежда'],
  [/ダウン|다운|\bdown\b/i, 'Пуховик', 'Куртки и верхняя одежда'],
  [/コート|코트|\bcoat\b/i, 'Пальто', 'Куртки и верхняя одежда'],
  [/カーディガン|가디건|cardigan/i, 'Кардиган', 'Свитшоты и трикотаж'],
  [/セーター|스웨터|sweater|jumper/i, 'Свитер', 'Свитшоты и трикотаж'],
  [/フリース|후리스|fleece/i, 'Флисовая кофта', 'Свитшоты и трикотаж'],
  [
    /ウインドプルーフ|ポケッタブル.*パーカ|ブロックテック|윈드프루프|포케터블|블럭테크|windproof|blocktech/i,
    'Ветровка',
    'Куртки и верхняя одежда',
  ],
  [/フーディ|후디|후드|スウェット.*パーカ|エアリズム.*パーカ|hoodie/i, 'Худи', 'Худи'],
  [/スウェットシャツ|スウェット.*クルー|스웨트셔츠|sweatshirt/i, 'Свитшот', 'Свитшоты и трикотаж'],
  [
    /ブルゾン|ジャケット|カバーオール|블루종|재킷|커버롤|\bjacket\b|blouson/i,
    'Куртка',
    'Куртки и верхняя одежда',
  ],
  [/パーカ|파카|parka/i, 'Парка', 'Куртки и верхняя одежда'],
  [/ベスト|베스트|\bvest\b/i, 'Жилет', 'Жилеты'],
  [/レギンス|타이츠|레깅스|leggings|tights/i, 'Леггинсы', 'Леггинсы'],
  [/ショーツ|ショートパンツ|쇼츠|쇼트팬츠|shorts/i, 'Шорты', 'Шорты'],
  [/ジーンズ|진즈|jeans/i, 'Джинсы', 'Брюки и джинсы'],
  [/パンツ|팬츠|trousers|pants/i, 'Брюки', 'Брюки и джинсы'],
  [/キャミ|캐미솔|camisole/i, 'Топ на бретелях', 'Топы и бельё'],
  [/ブラトップ|브라탑|bra top/i, 'Топ с чашечками', 'Топы и бельё'],
  [/ブラ(?!ッシュ)|브라(?!운)|\bbra\b/i, 'Бюстгальтер', 'Топы и бельё'],
  [/タンクトップ|탱크탑|tank top/i, 'Майка', 'Футболки и рубашки'],
  [/ポロ|폴로|\bpolo\b/i, 'Поло', 'Футболки и рубашки'],
  [
    /Tシャツ|ティーシャツ|셔츠.*T|그래픽T|크롭T|프릴T|티셔츠|\bUT\b|t[ -]?shirts?|\btee\b/i,
    'Футболка',
    'Футболки и рубашки',
  ],
  [/シャツ|셔츠|\bshirt\b/i, 'Рубашка', 'Футболки и рубашки'],
  [/ニット|니트|knit/i, 'Трикотаж', 'Свитшоты и трикотаж'],
  [/ソックス|양말|socks/i, 'Носки', 'Носки и аксессуары'],
  [/バッグ|가방|bag/i, 'Сумка', 'Сумки и аксессуары'],
  [/ベルト|벨트|belt/i, 'Ремень', 'Сумки и аксессуары'],
  [/帽子|ハット|キャップ|모자|캡|\bhat\b|\bcap\b/i, 'Головной убор', 'Головные уборы'],
  [/マフラー|ストール|머플러|스카프|scarf/i, 'Шарф', 'Носки и аксессуары'],
  [/手袋|장갑|gloves/i, 'Перчатки', 'Носки и аксессуары'],
  [/ボクサー|トランクス|브리프|트렁크|boxer|briefs/i, 'Трусы', 'Топы и бельё'],
  [/ヒートテック|히트텍|heattech/i, 'Термобельё', 'Топы и бельё'],
];
export function uniqloLength(value = '') {
  return value
    .normalize('NFKC')
    .replace(/着丈\s*(\d+(?:\.\d+)?)cm/gi, 'длина $1 см')
    .replace(/袖丈\s*(\d+(?:\.\d+)?)cm/gi, 'рукав $1 см')
    .replace(/股下\s*(\d+(?:\.\d+)?)cm/gi, 'шаговый шов $1 см')
    .replace(/기장\s*(\d+(?:\.\d+)?)cm/gi, 'длина $1 см');
}
export function uniqloSizeLabel(value) {
  return uniqloLength(value)
    .replace(/^サイズ\s*/, '')
    .replace(/(\d+(?:-\d+)?)\s*(?:歳|세)/g, '$1 лет')
    .replace(/(\d+(?:-\d+)?)\s*(?:ヶ月|개월)/g, '$1 мес.');
}
export function uniqloName(original = '', breadcrumbs = '', length = '', id = '') {
  const text = original.normalize('NFKC');
  const kind =
    kinds.find(([pattern]) => pattern.test(text)) ||
    kinds.find(([pattern]) => pattern.test(breadcrumbs));
  const [_, noun = 'Одежда', category = 'Одежда'] = kind || [];
  const details = [];
  if (/AIRism|エアリズム/i.test(text)) details.push('AIRism');
  if (/HEATTECH|ヒートテック|히트텍/i.test(text)) details.push('HEATTECH');
  if (/ウール|\b울\b|\bwool\b/i.test(text)) details.push('шерсть');
  if (/リネン|린넨|리넨|linen/i.test(text)) details.push('лён');
  if (/デニム|데님|denim/i.test(text) && noun !== 'Джинсы') details.push('деним');
  if (/スリム|슬림|slim/i.test(text)) details.push('Slim Fit');
  if (/オーバーサイズ|오버사이즈|oversized/i.test(text)) details.push('оверсайз');
  if (/クロップ|크롭|cropped/i.test(text)) details.push('укороченная модель');
  if (/ストレッチ|스트레치|stretch/i.test(text)) details.push('Stretch');
  const series = text.match(
    /(?:\bUT\b|DRY[ -]?EX|NANODESIGN|BLOCKTECH|Kando|SOUFFLE YARN|CHIIKAWA|Sanrio|mofusand|Monchhichi)/gi,
  );
  if (series) details.push(...new Set(series));
  const qualifier = uniqloLength(length);
  if (
    qualifier &&
    qualifier !== '-' &&
    !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(qualifier)
  )
    details.push(qualifier);
  return {
    name: `${noun} Uniqlo${details.length ? ' · ' + details.join(' · ') : ''}${noun === 'Одежда' && id ? ' · ' + (id.match(/\d{6}/)?.[0] || '') : ''}`.slice(
      0,
      180,
    ),
    category,
  };
}
