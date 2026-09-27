import { uniqloName } from '../uniqlo-labels.mjs';
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
  archivedProducts?: unknown[];
}[] = [nike, puma, reebok, clothing0, clothing1, clothing2, clothing3, clothing4];
const hiddenIds = new Set<string>(overrides.hiddenIds);
const hiddenUrls = new Set<string>(overrides.hiddenUrls);
const normalizeProduct = (p: unknown): Product => {
  const media = (
    productMedia as Record<string, { imageUrls?: string[]; color?: string; usage?: string }>
  )[(p as Product).id];
  const parsed = manualProductSchema.parse({ ...media, ...(p as object) });
  if (parsed.brand === 'Uniqlo' && parsed.usage && /Uniqlo \d{6}-\d{3}/.test(parsed.name)) {
    const length = parsed.sku?.match(/-\d{2}-\d{2}-(.+)$/)?.[1];
    Object.assign(
      parsed,
      uniqloName(parsed.usage, '', length === 'standard' ? '' : length, parsed.sku),
    );
  }
  return parsed;
};
const rawProducts = [...overrides.products, ...snapshots.flatMap((s) => s.products)].map(
  normalizeProduct,
);
export function githubProcurement() {
  const seen = new Set<string>();
  return [
    ...rawProducts.map((product) => ({ product, archived: false })),
    ...snapshots.flatMap((s) =>
      (s.archivedProducts || []).flatMap((raw) => {
        try {
          return [{ product: normalizeProduct(raw), archived: true }];
        } catch {
          return [];
        }
      }),
    ),
  ]
    .filter(({ product: p }) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return !p.demo && isCatalogBrand(p.brand);
    })
    .map(({ product, archived }) => ({
      product,
      selling: withSellingPrices(product),
      archived,
      hidden: hiddenIds.has(product.id) || hiddenUrls.has(product.productUrl),
      stale: archived || !offerVisible(product),
    }));
}

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
