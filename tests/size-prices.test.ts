import { expect, it } from 'vitest';
import { demoProducts } from '../src/lib/demo';
import { addToCart, readCart, writeCart } from '../src/lib/cart';
import { publicProduct } from '../src/lib/public-product';
import { whatsappOrder } from '../src/lib/whatsapp';
import { filterCatalog } from '../src/lib/catalog';
import { defaultFilters } from '../src/lib/types';
const p = {
  ...demoProducts[0],
  demo: false,
  sizes: ['42', '43'],
  saleKzt: 40000,
  sizePrices: [
    { size: '42', salePrice: '80', saleKzt: 40000 },
    { size: '43', salePrice: '100', saleKzt: 50000 },
  ],
};
it('uses selected size price in cart and WhatsApp without supplier URL', () => {
  const cart = addToCart([], p, '43');
  expect(cart[0].saleKzt).toBe(50000);
  expect(cart[0].productUrl).toBe('');
  const url = new URL(whatsappOrder('77001234567', [{ id: p.id, size: '43' }], [p]));
  expect(url.searchParams.get('text')?.replace(/\s/g, '')).toContain('50000');
  expect(url.searchParams.get('text')).not.toContain(p.productUrl);
});
it('removes supplier URLs in public payloads and old persisted carts', () => {
  expect(publicProduct(p).productUrl).toBe('');
  const items = addToCart([], p, '43');
  items[0].productUrl = p.productUrl;
  const stored = JSON.stringify({ version: 1, items });
  expect(readCart({ getItem: () => stored })[0].productUrl).toBe('');
  let written = '';
  writeCart(
    {
      setItem: (_, value) => {
        written = value;
      },
    },
    items,
  );
  expect(written).not.toContain(p.productUrl);
});
it('filters price against the requested size', () => {
  expect(filterCatalog([p], { ...defaultFilters, sizes: ['43'], maxPrice: 45000 }).total).toBe(0);
  const result = filterCatalog([p], { ...defaultFilters, sizes: ['43'], minPrice: 45000 });
  expect(result.products[0].saleKzt).toBe(50000);
});
