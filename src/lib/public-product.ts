import type { Product } from './types';
/** Supplier URLs stay in server storage, never in public catalog or cart responses. */
export function publicProduct(product: Product): Product {
  return { ...product, productUrl: '', externalId: '', delivery: undefined };
}
