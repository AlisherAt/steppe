import { spawn } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';
const supported = new Set([
  'adidas',
  'nike',
  'newbalance',
  'asics',
  'converse',
  'vans',
  'underarmour',
  'skechers',
  'salomon',
  'hoka',
]);
/** @param {import('@playwright/test').Page} page
 * @param {{id: string, url: string}} source
 * @param {{name: string} | null} candidate */
export async function extractPython(page, source, candidate = null) {
  if (process.env.PYTHON_SALE_PARSERS !== '1' || !supported.has(source.id)) return [];
  // Передаём снимок уже загруженного DOM. Python не делает запросов к магазинам.
  const html = await page.content();
  const input = JSON.stringify({
    source: source.id,
    url: page.url(),
    html,
    max: 100,
    ...(candidate ? { mode: 'detail', name: candidate.name } : {}),
  });
  if (Buffer.byteLength(input) > 4_000_000) throw Error('PYTHON_SNAPSHOT_TOO_LARGE');
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.env.PYTHON_EXECUTABLE || 'python',
      [resolvePath('scripts/python-sale/main.py')],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
    let output = '',
      finished = false;
    const finish = (error, products) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) {
        child.kill();
        reject(error);
      } else resolve(products);
    };
    const timer = setTimeout(() => finish(Error('PYTHON_PARSER_TIMEOUT')), 15000);
    child.on('error', () => finish(Error('PYTHON_PARSER_START_FAILED')));
    child.stdin.on('error', () => finish(Error('PYTHON_PARSER_INPUT_FAILED')));
    child.stderr.resume();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk.toString('utf8');
      if (Buffer.byteLength(output) > 2_000_000) finish(Error('PYTHON_OUTPUT_TOO_LARGE'));
    });
    child.on('close', (code) => {
      if (code !== 0) return finish(Error('PYTHON_PARSER_FAILED'));
      try {
        const { products, detail } = JSON.parse(output);
        if (candidate) {
          if (
            !detail ||
            (detail.sku !== null && (typeof detail.sku !== 'string' || detail.sku.length > 160)) ||
            !Array.isArray(detail.size_candidates) ||
            detail.size_candidates.length > 60 ||
            detail.size_candidates.some((s) => typeof s !== 'string' || s.length > 40)
          )
            throw Error();
          return finish(null, detail);
        }
        if (
          !Array.isArray(products) ||
          products.length > 100 ||
          products.some(
            (p) =>
              p.source !== source.id ||
              p.size_price_verified !== false ||
              p.currency !== 'USD' ||
              (p.sku !== null && (typeof p.sku !== 'string' || p.sku.length > 160)) ||
              !Number.isFinite(p.sale_price) ||
              !Number.isFinite(p.old_price) ||
              p.sale_price <= 0 ||
              p.sale_price >= p.old_price ||
              new URL(p.product_url).origin !== new URL(source.url).origin,
          )
        )
          throw Error();
        finish(null, products);
      } catch {
        finish(Error('PYTHON_INVALID_RESULT'));
      }
    });
    child.stdin.end(input);
  });
}
