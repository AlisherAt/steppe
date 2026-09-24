export const sources = [
  ['nike', 'Nike', 'https://www.nike.com/w/sale-shoes-3yaepzy7ok'],
  ['adidas', 'adidas', 'https://www.adidas.com/us/men-shoes-sale'],
  ['puma', 'Puma', 'https://us.puma.com/us/en/sale/all-sale'],
  ['reebok', 'Reebok', 'https://www.reebok.com/collections/sale'],
  [
    'newbalance',
    'New Balance',
    'https://www.newbalance.com/men/shoes/all-shoes/?prefn1=isSale&prefv1=true',
  ],
  ['asics', 'ASICS', 'https://www.asics.com/us/en-us/sale/c/aa60000000/'],
  ['converse', 'Converse', 'https://www.converse.com/shop/sale-shoes'],
  ['vans', 'Vans', 'https://www.vans.com/en-us/shoes-c00081?prefn1=sale&prefv1=true'],
  ['underarmour', 'Under Armour', 'https://www.underarmour.com/en-us/c/outlet/shoes/'],
  ['skechers', 'Skechers', 'https://www.skechers.com/sale/'],
  ['fila', 'Fila', 'https://www.fila.com/sale'],
  ['salomon', 'Salomon', 'https://www.salomon.com/en-us/shop/sale.html'],
  ['hoka', 'HOKA', 'https://www.hoka.com/en/us/sale/'],
  ['on', 'On', 'https://www.on.com/en-us/shop/classics'],
  ['brooks', 'Brooks', 'https://www.brooksrunning.com/en_us/sale/'],
].map(([id, brand, url]) => ({ id, brand, url }));
export const selectors = {
  cards:
    '.product-card, .product-tile, [data-testid="product-card"], [data-test="product-card"], [data-auto-id="product-container"], [data-test-id="product-list-item"], .card-wrapper',
  name: '.product-card__title, .product-name, .pdp-link, [data-auto-id="product-card-title"], [itemprop="name"], h3, h2',
  old: 'del, s, .is--striked-out, .price-standard, .price-original, .gl-price-item--crossed',
  sale: '.product-price:not(.is--striked-out), .sales .value, .price-sales, .price-item--sale, .gl-price-item--sale, [itemprop="price"], [data-testid="sale-price"], [data-testid="product-price"]:not(.is--striked-out)',
  next: 'a[rel="next"], a[aria-label="Next page"], .pagination-next a',
  more: 'button[data-testid="load-more"], button[name="showmore"], .show-more button',
};
