import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { z } from 'zod';
import Decimal from 'decimal.js';
import type { Rate } from '../types';
import { fetchText, IntegrationError, splitHosts } from './http';
const rateNumber = z
  .string()
  .regex(/^\d+(\.\d{1,12})?$/)
  .refine((v) => {
    try {
      return new Decimal(v).gt(0) && new Decimal(v).lte(10000000);
    } catch {
      return false;
    }
  });
const ratePayload = z.object({
  asOf: z.string().datetime({ offset: true }),
  rates: z.record(z.string().regex(/^[A-Z]{3}$/), rateNumber),
});
export function assertFresh(
  asOf: string,
  now = new Date(),
  maxAgeHours = Number(process.env.RATE_MAX_AGE_HOURS || 120),
) {
  const age = now.getTime() - Date.parse(asOf);
  if (
    !Number.isFinite(age) ||
    !Number.isFinite(maxAgeHours) ||
    maxAgeHours <= 0 ||
    age < -3600000 ||
    age > maxAgeHours * 3600000
  )
    throw new IntegrationError('STALE_EXCHANGE_RATE');
}
export function parseNbk(xml: string, now = new Date()): Rate[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw new IntegrationError('INVALID_RATE_XML');
  const parsed = new XMLParser({ parseTagValue: false, trimValues: true }).parse(xml);
  const items = parsed?.rss?.channel?.item;
  if (!items) throw new IntegrationError('INVALID_RATE_XML');
  return (Array.isArray(items) ? items : [items]).map((item: Record<string, string>) => {
    const currency = z
      .string()
      .regex(/^[A-Z]{3}$/)
      .parse(item.title);
    const parts = String(item.pubDate).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!parts) throw new IntegrationError('INVALID_RATE_DATE');
    const asOf = `${parts[3]}-${parts[2]}-${parts[1]}T00:00:00+05:00`;
    assertFresh(asOf, now);
    const amount = rateNumber.parse(String(item.description).replace(',', '.'));
    const units = rateNumber.parse(String(item.quant));
    return {
      currency,
      value: new Decimal(amount).div(units).toFixed(12),
      asOf: new Date(asOf).toISOString(),
      fetchedAt: now.toISOString(),
      source: 'Национальный Банк Казахстана',
    };
  });
}
function fromPayload(payload: unknown, source: string, now = new Date()): Rate[] {
  const data = ratePayload.parse(payload);
  assertFresh(data.asOf, now);
  return Object.entries(data.rates)
    .filter(([c]) => c !== 'KZT')
    .map(([currency, value]) => ({
      currency,
      value,
      source,
      asOf: data.asOf,
      fetchedAt: now.toISOString(),
    }));
}
export function nativeRate(now = new Date()): Rate {
  return {
    currency: 'KZT',
    value: '1',
    source: 'Цена магазина в тенге',
    asOf: now.toISOString(),
    fetchedAt: now.toISOString(),
  };
}
function manualRates(): Rate[] {
  if (!process.env.MANUAL_RATES_JSON || !process.env.MANUAL_RATE_AS_OF)
    throw new IntegrationError('MANUAL_RATE_NOT_CONFIGURED');
  return fromPayload(
    { rates: JSON.parse(process.env.MANUAL_RATES_JSON), asOf: process.env.MANUAL_RATE_AS_OF },
    process.env.MANUAL_RATE_LABEL || 'Ручной курс оператора',
  );
}
export async function loadRates(): Promise<Rate[]> {
  try {
    switch (process.env.RATE_PROVIDER || 'nbk') {
      case 'nbk':
        return [
          ...parseNbk(
            await fetchText('https://nationalbank.kz/rss/rates_all.xml', {
              hosts: ['nationalbank.kz'],
              attempts: 2,
              maxBytes: 500000,
            }),
          ),
          nativeRate(),
        ];
      case 'manual':
        return [...manualRates(), nativeRate()];
      case 'authorized-json': {
        const {
          AUTHORIZED_RATE_URL: url,
          AUTHORIZED_RATE_LABEL: label,
          AUTHORIZED_RATE_PERMISSION: permission,
        } = process.env;
        if (!url || !label || !permission)
          throw new IntegrationError('RATE_PROVIDER_NOT_CONFIGURED');
        const payload = JSON.parse(
          await fetchText(url, {
            hosts: splitHosts(process.env.AUTHORIZED_RATE_HOSTS),
            token: process.env.AUTHORIZED_RATE_TOKEN,
            attempts: 2,
            maxBytes: 500000,
          }),
        );
        return [...fromPayload(payload, label), nativeRate()];
      }
      default:
        throw new IntegrationError('UNKNOWN_RATE_PROVIDER');
    }
  } catch (e) {
    if (process.env.RATE_FALLBACK === 'manual' && process.env.RATE_PROVIDER !== 'manual')
      return [
        ...manualRates().map((r) => ({ ...r, source: `${r.source} (резервный)` })),
        nativeRate(),
      ];
    throw e;
  }
}
