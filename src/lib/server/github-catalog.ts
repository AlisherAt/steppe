import 'server-only';
import nike from '../../../data/catalog/nike-us.json';
import puma from '../../../data/catalog/puma-us.json';
import reebok from '../../../data/catalog/reebok-us.json';
import clothing0 from '../../../data/catalog/clothing-nike-us.json';
import clothing1 from '../../../data/catalog/clothing-puma-us.json';
import clothing2 from '../../../data/catalog/clothing-reebok-us.json';
import clothing3 from '../../../data/catalog/clothing-uniqlo-jp.json';
import clothing4 from '../../../data/catalog/clothing-uniqlo-kr.json';
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
const snapshots: {
  sourceId: string;
  sourceName: string;
  checkedAt: string | null;
  products: unknown[];
}[] = [nike, puma, reebok, clothing0, clothing1, clothing2, clothing3, clothing4];
const hiddenIds = new Set<string>(overrides.hiddenIds);
const hiddenUrls = new Set<string>(overrides.hiddenUrls);
const rawProducts: Product[] = [...overrides.products, ...snapshots.flatMap((s) => s.products)].map(
  (p) => {
    const media = (
      productMedia as Record<string, { imageUrls?: string[]; color?: string; usage?: string }>
    )[(p as Product).id];
    return manualProductSchema.parse({ ...media, ...(p as object) });
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
  return [...new Map(snapshots.map((s) => [s.sourceId, s])).values()].map((s) => {
    const successful =
      snapshots
        .filter((v) => v.sourceId === s.sourceId && v.checkedAt)
        .map((v) => v.checkedAt!)
        .sort()
        .at(-1) || null;
    const count = products.filter((p) => p.sourceId === s.sourceId).length;
    return {
      id: s.sourceId,
      name: s.sourceName,
      status: count ? 'ready' : successful ? 'error' : 'needs_configuration',
      lastSuccess: successful,
      lastAttempt: successful,
      offerCount: count,
      message: count
        ? 'Проверенные цены официального магазина. Каталог обновляется через GitHub дважды в день.'
        : s.sourceId.startsWith('uniqlo-')
          ? 'Ожидается успешная проверка цен и остатков регионального API Uniqlo.'
          : 'Последний снимок устарел. Ожидается успешное обновление магазина.',
    };
  });
}
