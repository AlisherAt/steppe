import 'server-only';
import nike from '../../../data/catalog/nike-us.json';
import puma from '../../../data/catalog/puma-us.json';
import reebok from '../../../data/catalog/reebok-us.json';
import overrides from '../../../data/catalog/overrides.json';
import productMedia from '../../../data/catalog/product-media.json';
import { manualProductSchema } from './manual-products';
import { isCatalogBrand } from '../catalog-policy';
import { offerVisible } from '../promotion';
import { orderableProduct } from '../orderable';
import { withSellingPrices } from '../selling-price';
import type { Product, SourceStatus } from '../types';

// Отдельный провайдер каталога: SeaTable остаётся базой учётных записей.
export const githubCatalogEnabled = () => (process.env.CATALOG_PROVIDER || 'github') === 'github';
const snapshots = [nike, puma, reebok];
const hiddenIds = new Set<string>(overrides.hiddenIds);
const hiddenUrls = new Set<string>(overrides.hiddenUrls);
const rawProducts: Product[] = [...overrides.products, ...snapshots.flatMap((s) => s.products)].map(
  (p) => {
    const media = (
      productMedia as Record<string, { imageUrls?: string[]; color?: string; usage?: string }>
    )[p.id];
    return manualProductSchema.parse({ ...media, ...p });
  },
);

export function githubProducts(now = Date.now()): Product[] {
  const seen = new Set<string>();
  return rawProducts
    .filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return (
        !hiddenIds.has(p.id) &&
        !hiddenUrls.has(p.productUrl) &&
        isCatalogBrand(p.brand) &&
        offerVisible(p, now) &&
        orderableProduct(p)
      );
    })
    .map(withSellingPrices);
}

export function githubSources(): SourceStatus[] {
  const products = githubProducts();
  return snapshots.map((s) => {
    const count = products.filter((p) => p.sourceId === s.sourceId).length;
    return {
      id: s.sourceId,
      name: s.sourceName,
      status: count ? 'ready' : 'error',
      lastSuccess: s.checkedAt,
      lastAttempt: s.checkedAt,
      offerCount: count,
      message: count
        ? 'Проверенные цены официального магазина. Каталог обновляется через GitHub дважды в день.'
        : 'Последний снимок устарел. Ожидается успешное обновление магазина.',
    };
  });
}
