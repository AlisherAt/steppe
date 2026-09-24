import { orderableProduct } from './orderable';
import type { Product } from './types';
import { formatKzt } from './money';
export function whatsappPhone(value: string) {
  if (!/^\+?[\d\s()-]+$/.test(value)) return null;
  const phone = value.replace(/\D/g, '');
  return /^[1-9]\d{7,14}$/.test(phone) ? phone : null;
}
export class CheckoutError extends Error {}
export function whatsappOrder(
  phone: string,
  selection: { id: string; size: string }[],
  products: Product[],
) {
  const number = whatsappPhone(phone);
  if (!number) throw new CheckoutError('Оформление в WhatsApp пока не настроено.');
  if (!selection.length || selection.length > 50)
    throw new CheckoutError('Добавьте товары в корзину.');
  const keys = new Set<string>();
  let total = 0;
  const lines = selection.map((item, index) => {
    const key = JSON.stringify([item.id, item.size]);
    if (keys.has(key)) throw new CheckoutError('В корзине повторяются товары. Откройте её заново.');
    keys.add(key);
    const product = products.find((p) => p.id === item.id && !p.demo && orderableProduct(p));
    if (!product || (product.sizes.length ? !product.sizes.includes(item.size) : item.size !== ''))
      throw new CheckoutError(
        'Некоторые товары или размеры больше недоступны. Откройте корзину заново и удалите их.',
      );
    const price = product.sizePrices?.find((v) => v.size === item.size)?.saleKzt ?? product.saleKzt;
    total += price;
    const clean = (s: string) => s.replace(/[\r\n\t]+/g, ' ');
    return `${index + 1}. ${clean(product.brand)} — ${clean(product.name)}\nРазмер: ${item.size ? `EU ${clean(item.size)}` : 'уточнить'} · 1 пара\nЦена: ${formatKzt(price)}\nКод товара: ${product.id}`;
  });
  const text = `Здравствуйте! Хочу оформить заказ в STEPPE.\n\n${lines.join('\n\n')}\n\nВсего пар: ${selection.length}\nОриентировочная сумма: ${formatKzt(total)}\n\nПодтвердите, пожалуйста, наличие, окончательную стоимость и способ оплаты.`;
  const url = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  if (url.length > 16000)
    throw new CheckoutError(
      'Список слишком длинный для WhatsApp. Разделите корзину на несколько заказов.',
    );
  return url;
}
