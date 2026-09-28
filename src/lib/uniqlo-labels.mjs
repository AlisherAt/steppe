// Тип определяется по исходному названию, а не по технологии ткани или общему разделу.
// Неизвестные товары не публикуются. Это правило общее для сборщика и витрины.
const excluded =
  /グローブ|ミトン|手袋|글러브|미튼|장갑|\bgloves?\b|\bmittens?\b|スカーフ|マフラー|ストール|バンダナ|ハンカチ|스카프|머플러|스톨|반다나|손수건|\bscar(?:f|ves)\b|\bbandanas?\b|\bhandkerchiefs?\b|ソックス|양말|삭스|\bsocks?\b|バッグ|バックパック|가방|백팩|숄더백|핸들백|기프트백|리유저블백|스트링백|\bbags?\b|\bbackpacks?\b|ベルト|벨트|\bbelts?\b|ネクタイ|\bneckties?\b|サングラス|선글라스|\bsunglasses\b|マスク|フェイスカバー|アームカバー|마스크|\bmasks?\b|アンブレラ|엄브렐라|\bumbrellas?\b|毛布|敷きパッド|ブランケット|タオル|クッション|담요|이불|타월|\bblankets?\b|\bcushions?\b|\btowels?\b|花瓶|フラワーベース|ピッチャー|トルコギキョウ|ピンクッション|화병|꽃병|\bvases?\b|\bpitchers?\b|\bbouquets?\b|\bflowers?\b|ルームシューズ|スニーカー|シューズ|ブーツ|サンダル|슈즈|스니커즈|부츠|샌들|\bshoes?\b|\bsneakers?\b|\bboots?\b|\bslippers?\b/i;
export const uniqloClothingCategories = [
  'Боди и комбинезоны',
  'Брюки и джинсы',
  'Головные уборы',
  'Домашняя одежда',
  'Жилеты',
  'Куртки и верхняя одежда',
  'Леггинсы',
  'Пиджаки',
  'Платья и юбки',
  'Свитшоты и трикотаж',
  'Топы и бельё',
  'Футболки и рубашки',
  'Худи',
  'Шорты',
];
/** @type {Array<[RegExp, string, string]>} */
const kinds = [
  [/バケットハット|버킷햇|bucket hat/i, 'Панама', 'Головные уборы'],
  [/ビーニー|ニットキャップ|비니|니트캡|\bbeanie\b/i, 'Шапка', 'Головные уборы'],
  [/キャップ|캡|\bcap\b/i, 'Кепка', 'Головные уборы'],
  [/帽子|ハット|모자|\bhat\b/i, 'Головной убор', 'Головные уборы'],
  [/ペチコート|페티코트|petticoat/i, 'Нижняя юбка', 'Топы и бельё'],
  [
    /ボクサー|トランクス|ブリーフ|브리프|트렁크|boxer|briefs|(?:シームレス|サニタリー|シェイパー|コットン|ソフトモダール|マタニティ)ショーツ|ショーツ.*(?:ミドルウエスト|ジャストウエスト|ヒップハンガー)/i,
    'Трусы',
    'Топы и бельё',
  ],
  [/タイツ|타이츠|타이즈|\btights\b/i, 'Колготки', 'Леггинсы'],
  [/レギンス|레깅스|leggings/i, 'Леггинсы', 'Леггинсы'],
  [/チノ|치노|\bchinos?\b/i, 'Брюки чинос', 'Брюки и джинсы'],
  [/キュロット|퀼로트|큐롯|culottes/i, 'Кюлоты', 'Брюки и джинсы'],
  [/ジョーツ|조츠|jorts/i, 'Джинсовые шорты', 'Шорты'],
  [/サロペット|살로페트|dungarees/i, 'Полукомбинезон', 'Боди и комбинезоны'],
  [/^(?:BN|BABY).*커버올|(?:フライス|キルト)カバーオール/i, 'Комбинезон', 'Боди и комбинезоны'],
  [/ステテコ|リラコ|steteco|relaco/i, 'Домашние брюки', 'Домашняя одежда'],
  [/肌着|インナーUネック/i, 'Нательная рубашка', 'Топы и бельё'],
  [/ガウン|가운|\brobe\b/i, 'Халат', 'Домашняя одежда'],
  [
    /(?:エアリズム|ウルトラストレッチ|フリース|スウェット).*セット|(?:AIRism|후리스|스웨트|라운지).*세트/i,
    'Домашний комплект',
    'Домашняя одежда',
  ],
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
  [/ワンピース|원피스|드레스|\bdress\b/i, 'Платье', 'Платья и юбки'],
  [/スカート|스커트|\bskirt\b/i, 'Юбка', 'Платья и юбки'],
  [/シャツジャケット|셔츠재킷|shirt jacket/i, 'Куртка-рубашка', 'Куртки и верхняя одежда'],
  [
    /ブレザー|블레이저|ウール.*ジャケット|ストレッチジャケット|感動ジャケット|テーラード|コンフォート.*ジャケット|울.*재킷|컴포트.*재킷|감탄재킷|테일러드|blazer|suit jacket|tailored/i,
    'Пиджак',
    'Пиджаки',
  ],
  [/リネン.*ジャケット|린넨.*재킷|리넨.*재킷|linen.*jacket/i, 'Пиджак', 'Пиджаки'],
  [/ダウン.*コート|다운.*코트|down.*coat/i, 'Пуховое пальто', 'Куртки и верхняя одежда'],
  [
    /ダウン.*(?:ジャケット|パーカ)|다운.*(?:재킷|파카)|\bdown\b.*\b(?:jacket|parka)\b/i,
    'Пуховик',
    'Куртки и верхняя одежда',
  ],
  [/コート|코트|\bcoat\b/i, 'Пальто', 'Куртки и верхняя одежда'],
  [/カーディガン|가디건|cardigan/i, 'Кардиган', 'Свитшоты и трикотаж'],
  [/セーター|스웨터|sweater|jumper/i, 'Свитер', 'Свитшоты и трикотаж'],
  [
    /(?:ウインドプルーフ|ウィンドプルーフ|ポケッタブル|ブロックテック).*パーカ|(?:윈드프루프|포케터블|블럭테크).*파카|(?:windproof|blocktech).*parka/i,
    'Ветровка',
    'Куртки и верхняя одежда',
  ],
  [
    /フーディ|후디|후드|(?:スウェット|エアリズム|フリース|ドライEX).*パーカ|hoodie/i,
    'Худи',
    'Худи',
  ],
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
  [/ジーンズ|진즈|진(?:\(|$)|jeans/i, 'Джинсы', 'Брюки и джинсы'],
  [/パンツ|팬츠|trousers|pants/i, 'Брюки', 'Брюки и джинсы'],
  [/キャミ|캐미솔|camisole/i, 'Топ на бретелях', 'Топы и бельё'],
  [/ブラトップ|브라탑|bra top/i, 'Топ с чашечками', 'Топы и бельё'],
  [/ブラ(?!ッシュ|ウス|ウン)|브라(?!운)|\bbra\b/i, 'Бюстгальтер', 'Топы и бельё'],
  [/Tノースリーブ|슬리브리스니트/i, 'Топ без рукавов', 'Топы и бельё'],
  [/タンクトップ|탱크탑|tank top/i, 'Майка', 'Футболки и рубашки'],
  [/ポロ|폴로|\bpolo\b/i, 'Поло', 'Футболки и рубашки'],
  [/ブラウス|블라우스|blouse/i, 'Блузка', 'Футболки и рубашки'],
  [/(?:[\u3040-\u30ff\uac00-\ud7af]|\s)T(?:[/(].*)?$/, 'Футболка', 'Футболки и рубашки'],
  [
    /Tシャツ|ティーシャツ|셔츠.*T|그래픽T|크롭T|프릴T|티셔츠|\bUT\b|t[ -]?shirts?|\btee\b/i,
    'Футболка',
    'Футболки и рубашки',
  ],
  [/シャツ|셔츠|\bshirt\b/i, 'Рубашка', 'Футболки и рубашки'],
  [/プルオーバー|풀오버|pullover/i, 'Пуловер', 'Свитшоты и трикотаж'],
];
export function uniqloLength(value = '') {
  return value
    .normalize('NFKC')
    .replace(/着丈\s*(\d+(?:\.\d+)?)cm/gi, 'длина $1 см')
    .replace(/袖丈\s*(\d+(?:\.\d+)?)cm/gi, 'рукав $1 см')
    .replace(/裄丈\s*(\d+(?:\.\d+)?)cm/gi, 'рукав от центра спины $1 см')
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
  // Общие breadcrumbs могут перечислять соседние категории и не доказывают тип вещи.
  const blocked = excluded.test(text);
  const kind = blocked ? undefined : kinds.find(([pattern]) => pattern.test(text));
  let [_, noun = 'Товар', category = 'Не определена'] = kind || [];
  if (noun === 'Футболка' && /長袖|긴팔|long sleeve|[89]分袖|9부/i.test(text)) noun = 'Лонгслив';
  if (['Футболка', 'Лонгслив'].includes(noun) && /タートル|ハイネック|터틀넥|하이넥/i.test(text))
    noun = 'Водолазка';
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
  if (/フリース|후리스|fleece/i.test(text) && !noun.startsWith('Флисов')) details.push('флис');
  if (/カシミヤ|캐시미어|cashmere/i.test(text)) details.push('кашемир');
  if (/コーデュロイ|코듀로이|corduroy/i.test(text))
    details.push(/コーデュロイライク/i.test(text) ? 'фактура под вельвет' : 'вельвет');
  if (/ストライプ|스트라이프|striped?/i.test(text)) details.push('в полоску');
  if (/チェック|체크|checked/i.test(text)) details.push('в клетку');
  if (/ワイド|와이드|\bwide\b/i.test(text)) details.push('широкий крой');
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
    allowed: Boolean(kind),
    reason: blocked ? 'excluded' : kind ? 'clothing' : 'unknown',
    name: `${noun} Uniqlo${details.length ? ' · ' + details.join(' · ') : ''}${!kind && id ? ' · ' + (id.match(/\d{6}/)?.[0] || '') : ''}`.slice(
      0,
      180,
    ),
    category,
  };
}

export function isAllowedUniqloProduct(product) {
  return product.brand?.toLowerCase() !== 'uniqlo' || uniqloName(product.usage || '').allowed;
}
