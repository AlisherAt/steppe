import { searchKicksProducts } from '../src/lib/server/kicks';
import { safeCode } from '../src/lib/server/http';
try {
  process.loadEnvFile('.env.local');
} catch {
  /* Vercel/CI may supply the environment. */
}
async function main() {
  const products = await searchKicksProducts(process.argv[2] || 'adidas', 1);
  console.log(
    JSON.stringify({
      status: 'ok',
      source: 'KicksDB / StockX',
      products: products.length,
      variants: products.reduce((n, p) => n + p.variants.length, 0),
      markets: [...new Set(products.flatMap((p) => p.variants.map((v) => v.market)))],
      currencies: [...new Set(products.flatMap((p) => p.variants.map((v) => v.currency)))],
      liveOffersPublished: 0,
      message:
        'Проверено соединение. Ответ не подтверждает скидку магазина, срок акции и доставку KZ.',
    }),
  );
}
main().catch((e) => {
  console.error(safeCode(e));
  process.exitCode = 1;
});
