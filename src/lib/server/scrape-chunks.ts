import { createHash } from 'node:crypto';
import { IntegrationError } from './http';

export const scrapeChunkFormat = 'steppe-products-v1';
const maxBytes = 48000; // Ниже лимита SeaTable Long Text (100 000 символов).
export function scrapeProductsHash(products: unknown[]) {
  return createHash('sha256').update(JSON.stringify(products)).digest('hex');
}
export function packScrapeProducts(products: unknown[]): string[] {
  const chunks: string[] = [];
  const envelope = (values: string[]) =>
    `{"format":"${scrapeChunkFormat}","products":[${values.join(',')}]}`;
  let values: string[] = [];
  for (const product of products) {
    const text = JSON.stringify(product);
    if (Buffer.byteLength(envelope([text])) > maxBytes)
      throw new IntegrationError('SCRAPE_PRODUCT_TOO_LARGE');
    if (values.length && Buffer.byteLength(envelope([...values, text])) > maxBytes) {
      chunks.push(envelope(values));
      values = [];
    }
    values.push(text);
  }
  if (values.length) chunks.push(envelope(values));
  return chunks;
}
export function unpackScrapeProducts(
  rows: { id: string; data: unknown }[],
  expectedChunks: number,
  checksum: string,
): unknown[] {
  if (!Number.isInteger(expectedChunks) || expectedChunks < 0 || rows.length !== expectedChunks)
    throw new IntegrationError('INCOMPLETE_SCRAPE_SNAPSHOT');
  const sorted = [...rows].sort(
    (a, b) => Number(a.id.split(':').pop()) - Number(b.id.split(':').pop()),
  );
  const products: unknown[] = [];
  for (const [index, row] of sorted.entries()) {
    const data = row.data as { format?: string; products?: unknown[] } | null;
    if (
      row.id.split(':').pop() !== String(index) ||
      data?.format !== scrapeChunkFormat ||
      !Array.isArray(data.products)
    )
      throw new IntegrationError('INCOMPLETE_SCRAPE_SNAPSHOT');
    products.push(...data.products);
  }
  if (scrapeProductsHash(products) !== checksum)
    throw new IntegrationError('INCOMPLETE_SCRAPE_SNAPSHOT');
  return products;
}
