export type Gender = 'men' | 'women' | 'unisex' | 'kids';
export type Rate = {
  currency: string;
  value: string;
  source: string;
  asOf: string;
  fetchedAt: string;
};
export type Product = {
  id: string;
  externalId: string;
  sourceId: string;
  sourceName: string;
  brand: string;
  name: string;
  imageUrl: string | null;
  productUrl: string;
  sizePrices?: { size: string; salePrice: string; saleKzt: number }[];
  sizes: string[];
  gender: Gender;
  category: string;
  offerKind?: 'market' | 'retail';
  purchaseType?: 'fixed';
  warehouseCountry?: string;
  market?: 'US' | 'EU';
  sku?: string;
  sourceUpdatedAt?: string;
  originalPrice: string | null;
  salePrice: string;
  currency: string;
  originalKzt: number | null;
  saleKzt: number;
  discount: number;
  rate: Rate;
  saleStartsAt?: string;
  saleEndsAt?: string;
  updatedAt: string;
  firstSeenAt: string;
  demo: boolean;
  delivery?: {
    country: 'KZ';
    basis: 'merchant-feed' | 'ebay-filter';
    checkedAt: string;
    policyUrl: string;
  };
};
export type SourceStatus = {
  id: string;
  name: string;
  status: 'ready' | 'needs_configuration' | 'paused' | 'error';
  lastSuccess: string | null;
  lastAttempt: string | null;
  nextRefreshAt?: string | null;
  message: string;
  offerCount: number;
};
export type Filters = {
  q: string;
  brands: string[];
  sizes: string[];
  sources: string[];
  gender: string;
  category: string;
  minPrice: number;
  maxPrice: number;
  minDiscount: number;
  sort: 'newest' | 'discount' | 'price_asc' | 'price_desc';
  page: number;
};
export type Facets = {
  brands: string[];
  sizes: string[];
  sources: { id: string; name: string }[];
  categories: string[];
};
export type CatalogResult = {
  products: Product[];
  total: number;
  facets: Facets;
  mode: 'live' | 'demo';
  page: number;
  pages: number;
  error?: string;
};
export const defaultFilters: Filters = {
  q: '',
  brands: [],
  sizes: [],
  sources: [],
  gender: '',
  category: '',
  minPrice: 0,
  maxPrice: 1000000,
  minDiscount: 0,
  sort: 'newest',
  page: 1,
};
