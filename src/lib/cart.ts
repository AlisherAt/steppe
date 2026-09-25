import { z } from 'zod';
import type { Product } from './types';
import { roundCustomerPrice } from './selling-price';
export const CART_KEY = 'steppe.cart.v1';
const httpsUrl = z
  .string()
  .url()
  .refine((v) => {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password;
  });
const itemSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().max(180),
  brand: z.string().max(80),
  gender: z.enum(['men', 'women', 'unisex', 'kids']).optional(),
  sourceName: z.string().max(80),
  productUrl: z.union([z.literal(''), httpsUrl]).transform(() => ''),
  imageUrl: httpsUrl.nullable(),
  saleKzt: z.number().int().positive().max(1000000000),
  size: z.string().max(20),
  demo: z.boolean(),
  updatedAt: z.string().datetime({ offset: true }),
});
export type CartItem = z.infer<typeof itemSchema>;
export const cartItemKey = (item: Pick<CartItem, 'id' | 'size'>) => `${item.id}:${item.size}`;
export function addToCart(items: CartItem[], product: Product, size: string): CartItem[] {
  if (product.sizes.length && !product.sizes.includes(size))
    throw new Error('Выберите доступный размер');
  const item = itemSchema.parse({
    id: product.id,
    name: product.name,
    brand: product.brand,
    gender: product.gender,
    sourceName: product.sourceName,
    productUrl: '',
    imageUrl: product.imageUrl,
    saleKzt: product.sizePrices?.find((v) => v.size === size)?.saleKzt ?? product.saleKzt,
    size,
    demo: product.demo,
    updatedAt: product.updatedAt,
  });
  return [...items.filter((i) => cartItemKey(i) !== cartItemKey(item)), item].slice(-50);
}
export function readCart(storage: Pick<Storage, 'getItem'>): CartItem[] {
  try {
    const value = JSON.parse(storage.getItem(CART_KEY) || 'null');
    if (value?.version !== 1) return [];
    return z
      .array(itemSchema)
      .max(50)
      .parse(value.items)
      .map((item) => (item.demo ? item : { ...item, saleKzt: roundCustomerPrice(item.saleKzt) }));
  } catch {
    return [];
  }
}
export function writeCart(storage: Pick<Storage, 'setItem'>, items: CartItem[]) {
  storage.setItem(
    CART_KEY,
    JSON.stringify({ version: 1, items: z.array(itemSchema).max(50).parse(items) }),
  );
}
