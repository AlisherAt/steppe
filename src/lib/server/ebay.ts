import { z } from 'zod';
import Decimal from 'decimal.js';
import { brandInTitle, normalizeBrand } from '../brands';
import { fetchText, IntegrationError, publicHttps } from './http';
import { deduplicate, feedProductSchema, type FeedProduct, type SourceAdapter } from './adapters';
const price = z.object({
  value: z.string().regex(/^\d+(\.\d+)?$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
const itemSchema = z.object({
  itemId: z.string(),
  title: z.string(),
  itemWebUrl: z.string().url(),
  itemAffiliateWebUrl: z.string().url().optional(),
  brand: z.string().optional(),
  price: price.optional(),
  marketingPrice: z
    .object({ originalPrice: price.optional(), priceTreatment: z.string().optional() })
    .optional(),
  image: z.object({ imageUrl: z.string().url() }).optional(),
  conditionId: z.string().optional(),
  buyingOptions: z.array(z.string()).optional(),
  itemEndDate: z.string().optional(),
  seller: z.object({ feedbackPercentage: z.string(), feedbackScore: z.number() }).optional(),
});
const resultSchema = z.object({
  total: z.number().int().nonnegative(),
  itemSummaries: z.array(itemSchema).max(200).optional(),
  errors: z.array(z.unknown()).optional(),
});
export function parseEbayResults(payload: unknown, now = new Date()): FeedProduct[] {
  const data = resultSchema.safeParse(payload);
  if (!data.success || data.data.errors?.length)
    throw new IntegrationError('INVALID_EBAY_RESPONSE');
  if (data.data.total > 0 && !data.data.itemSummaries)
    throw new IntegrationError('INCOMPLETE_EBAY_RESPONSE');
  return deduplicate(
    (data.data.itemSummaries || []).flatMap((item) => {
      const old = item.marketingPrice?.originalPrice,
        sale = item.price;
      if (
        !old ||
        !sale ||
        item.marketingPrice?.priceTreatment !== 'STP' ||
        !item.seller ||
        Number(item.seller.feedbackPercentage) < 98 ||
        !Number.isFinite(Number(item.seller.feedbackPercentage)) ||
        item.seller.feedbackScore < 100 ||
        old.currency !== sale.currency ||
        item.conditionId !== '1000' ||
        !item.buyingOptions?.includes('FIXED_PRICE')
      )
        return [];
      if (
        !/sneakers?|trainers?|(?:running|athletic|basketball|tennis|skate|trail) shoes?/i.test(
          item.title,
        ) ||
        /shoelaces|insoles|\bsocks?\b/i.test(item.title)
      )
        return [];
      if (
        item.itemEndDate &&
        (!Number.isFinite(Date.parse(item.itemEndDate)) ||
          Date.parse(item.itemEndDate) <= now.getTime())
      )
        return [];
      if (!new Decimal(old.value).gt(sale.value)) return [];
      const brand = item.brand ? normalizeBrand(item.brand) : brandInTitle(item.title);
      if (!brand) return [];
      const productUrl = item.itemAffiliateWebUrl || item.itemWebUrl;
      publicHttps(productUrl, ['www.ebay.com', 'ebay.com']);
      if (item.image) publicHttps(item.image.imageUrl, ['i.ebayimg.com']);
      return [
        feedProductSchema.parse({
          id: item.itemId,
          brand,
          name: item.title,
          productUrl,
          imageUrl: item.image?.imageUrl || null,
          originalPrice: old.value,
          salePrice: sale.value,
          currency: sale.currency,
          sizes: [],
          gender: 'unisex',
          category: 'Кроссовки',
          available: true,
          delivery: {
            country: 'KZ',
            basis: 'ebay-filter',
            checkedAt: now.toISOString(),
            policyUrl: item.itemWebUrl,
          },
        }),
      ];
    }),
  );
}
let cachedToken: { value: string; expires: number; credentials: string } | undefined;
export class EbayAdapter implements SourceAdapter {
  id = 'ebay';
  name = 'eBay';
  configurationMessage =
    'Нужны production-доступ eBay Buy API, Client ID и Client Secret. Получение OAuth-токена автоматизировано.';
  configured() {
    return Boolean(
      process.env.EBAY_CLIENT_ID &&
      process.env.EBAY_CLIENT_SECRET &&
      process.env.EBAY_API_PERMISSION,
    );
  }
  async fetchProducts(): Promise<FeedProduct[]> {
    if (!this.configured()) throw new IntegrationError('SOURCE_NOT_CONFIGURED');
    const credentials = Buffer.from(
      `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`,
    ).toString('base64');
    if (
      !cachedToken ||
      cachedToken.expires < Date.now() ||
      cachedToken.credentials !== credentials
    ) {
      const response = await fetchText('https://api.ebay.com/identity/v1/oauth2/token', {
        hosts: ['api.ebay.com'],
        method: 'POST',
        attempts: 2,
        maxBytes: 50000,
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'https://api.ebay.com/oauth/api_scope',
        }).toString(),
      });
      const token = z
        .object({ access_token: z.string().min(1), expires_in: z.number().min(60) })
        .safeParse(JSON.parse(response));
      if (!token.success) throw new IntegrationError('EBAY_TOKEN_FAILED');
      cachedToken = {
        value: token.data.access_token,
        expires: Date.now() + (token.data.expires_in - 60) * 1000,
        credentials,
      };
    }
    const query = (process.env.EBAY_QUERY || 'sneakers').slice(0, 100);
    const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
    url.search = new URLSearchParams({
      q: query,
      limit: '200',
      sort: 'newlyListed',
      filter: 'buyingOptions:{FIXED_PRICE},conditionIds:{1000},deliveryCountry:KZ',
    }).toString();
    let text: string;
    try {
      text = await fetchText(url.toString(), {
        hosts: ['api.ebay.com'],
        token: cachedToken.value,
        attempts: 2,
        headers: { 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
      });
    } catch (e) {
      cachedToken = undefined;
      throw e;
    }
    return parseEbayResults(JSON.parse(text));
  }
}
