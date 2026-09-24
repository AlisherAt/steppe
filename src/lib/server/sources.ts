import { z } from 'zod';
import { PartnerFeedAdapter, type SourceAdapter } from './adapters';
import { EbayAdapter } from './ebay';
import { KicksAdapter } from './kicks-adapter';
import { IntegrationError } from './http';
const customSchema = z
  .array(
    z.object({
      id: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
      name: z.string().min(1).max(80),
      prefix: z.string().regex(/^[A-Z][A-Z0-9_]{1,40}$/),
      format: z.enum(['json', 'yml', 'awin-csv', 'google-csv', 'google-xml']).default('json'),
    }),
  )
  .max(20);
export function getAdapters(): SourceAdapter[] {
  const sources: SourceAdapter[] = [
    new KicksAdapter(),
    new PartnerFeedAdapter(
      'farfetch',
      'FARFETCH',
      'FARFETCH',
      'Нужен одобренный партнёрский фид FARFETCH.',
      'yml',
    ),
    new PartnerFeedAdapter('yoox', 'YOOX', 'YOOX', 'Нужен разрешённый региональный фид YOOX.'),
    new PartnerFeedAdapter(
      'tennisnuts',
      'Tennisnuts',
      'TENNISNUTS',
      'Для импорта нужен согласованный товарный фид Tennisnuts.',
    ),
    new PartnerFeedAdapter(
      'nike',
      'Nike',
      'NIKE',
      'Нужен разрешённый партнёрский фид Nike и настройки NIKE_FEED_*.',
    ),
    new PartnerFeedAdapter(
      'adidas',
      'Adidas',
      'ADIDAS',
      'Нужен разрешённый партнёрский фид Adidas и настройки ADIDAS_FEED_*.',
    ),
    new PartnerFeedAdapter(
      'admitad',
      'Магазин через Admitad',
      'ADMITAD',
      'Нужен полный YML-экспорт выбранного магазина из кабинета Admitad. Настройки ADMITAD_FEED_*.',
      'yml',
    ),
    new PartnerFeedAdapter(
      'awin',
      'Магазин через Awin',
      'AWIN',
      'Нужен CSV-URL из Create-a-Feed Awin и разрешение рекламодателя. Настройки AWIN_FEED_*.',
      'awin-csv',
    ),
    new PartnerFeedAdapter(
      'gdeslon',
      'Магазин через «Где Слон?»',
      'GDESLON',
      'Нужен полный товарный YML-фид выбранного магазина и партнёрский ключ в URL. Настройки GDESLON_FEED_*.',
      'yml',
    ),
    new PartnerFeedAdapter(
      'retailer',
      'Партнёрский магазин',
      'RETAILER',
      'Нужен разрешённый YML-фид зарубежного магазина.',
      'yml',
    ),
    new PartnerFeedAdapter(
      'google-feed',
      'Магазин с Google-фидом',
      'GOOGLE_FEED',
      'Нужен разрешённый XML/RSS экспорт продавца в формате Google Merchant. Это не API выдачи Google Shopping.',
      'google-xml',
    ),
    new EbayAdapter(),
  ];
  let custom: z.infer<typeof customSchema>;
  try {
    custom = customSchema.parse(JSON.parse(process.env.ADDITIONAL_SOURCES_JSON || '[]'));
  } catch {
    throw new IntegrationError('INVALID_SOURCE_REGISTRY');
  }
  for (const s of custom) {
    if (sources.some((a) => a.id === s.id)) throw new IntegrationError('DUPLICATE_SOURCE_ID');
    sources.push(
      new PartnerFeedAdapter(
        s.id,
        s.name,
        s.prefix,
        `Нужен разрешённый фид ${s.name}. Настройки ${s.prefix}_FEED_*.`,
        s.format,
      ),
    );
  }
  for (const s of sources) {
    const prefix =
      custom.find((c) => c.id === s.id)?.prefix ||
      (
        {
          admitad: 'ADMITAD',
          awin: 'AWIN',
          gdeslon: 'GDESLON',
          retailer: 'RETAILER',
          'google-feed': 'GOOGLE_FEED',
        } as Record<string, string>
      )[s.id];
    if (prefix && process.env[`${prefix}_STORE_NAME`])
      s.name = process.env[`${prefix}_STORE_NAME`]!.slice(0, 80);
  }
  return sources;
}
