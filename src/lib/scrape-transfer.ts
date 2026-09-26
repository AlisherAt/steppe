import { gunzipSync } from 'node:zlib';
export const maxScrapeWireBytes = 3_000_000;
export const maxScrapeJsonBytes = 24_000_000;
export function decodeScrapeBody(bytes: Uint8Array, encoding: string | null): string {
  if (bytes.byteLength > maxScrapeWireBytes) throw Error('REPORT_TOO_LARGE');
  if (encoding && encoding !== 'gzip' && encoding !== 'identity') throw Error('REPORT_ENCODING');
  const data =
    encoding === 'gzip'
      ? gunzipSync(bytes, { maxOutputLength: maxScrapeJsonBytes })
      : Buffer.from(bytes);
  if (data.byteLength > maxScrapeJsonBytes) throw Error('REPORT_TOO_LARGE');
  return data.toString('utf8');
}
