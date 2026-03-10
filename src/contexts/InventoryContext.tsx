/**
 * INVENTORY LIFECYCLE FLOW (single source of truth: backend at API_BASE_URL)
 *
 * 1. UI form → addProduct() / updateProduct()
 * 2. apiPost/apiPut(API_BASE_URL, ...) → backend; DB owned by backend.
 * 3. Read: React Query useQuery (fetchProductsForWarehouse) is the only cache (Phase 6 Part 2).
 * 4. Cache: localStorage / IndexedDB — NOT source of truth.
 *
 * STABILITY (Phase 4): Add product uses optimistic UI — insert temp with _pending, then replace with
 * server response on success; on failure remove temp and show error. No full refetch after add.
 * No "saved" without confirmed 2xx. Offline path still uses local-first; ADD_PRODUCT_SAVED_LOCALLY for that flow.
 */
import { createContext, useContext, useState, useRef, ReactNode, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Product } from '../types';
import { getStoredData, isStorageAvailable } from '../lib/storage';
import { API_BASE_URL } from '../lib/api';
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/apiClient';
import { getApiCircuitBreaker } from '../lib/circuit';
import { queryKeys } from '../lib/queryKeys';
import { useWarehouse } from './WarehouseContext';
import { isValidWarehouseId } from '../lib/warehouseId';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { getCategoryDisplay, normalizeProductLocation, normalizeQuantityBySize } from '../lib/utils';
import { parseProductsResponse } from '../lib/apiSchemas';
import { useInventory as useOfflineInventory } from '../hooks/useInventory';
import { getProductImages, setProductImages } from '../lib/productImagesStore';

/** React Query is the only cache for products; invalidate on Realtime and after mutations. */

/** Normalize API row to Product (for use in fetchProductsForWarehouse). */
function normalizeProductRow(p: any): Product {
  const rawSizes = p.quantityBySize ?? p.quantity_by_size;
  return normalizeProductLocation({
    ...p,
    images: Array.isArray(p.images) ? p.images : [],
    quantity: Number(p.quantity ?? 0) || 0,
    costPrice: Number(p.costPrice ?? p.cost_price ?? 0) || 0,
    sellingPrice: Number(p.sellingPrice ?? p.selling_price ?? 0) || 0,
    reorderLevel: Number(p.reorderLevel ?? p.reorder_level ?? 0) || 0,
    createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
    updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date(),
    expiryDate: p.expiryDate ? new Date(p.expiryDate) : null,
    sizeKind: (p.sizeKind ?? p.size_kind ?? 'na') as 'na' | 'one_size' | 'sized',
    quantityBySize: normalizeQuantityBySize(rawSizes),
  });
}

/** Default page size for initial load (API-side pagination to avoid 29MB fetch). */
const INITIAL_PRODUCTS_PAGE_SIZE = 50;

/**
 * Fetch products for a warehouse (Phase 6 Part 2: used as React Query queryFn).
 * When initialPageSize is set, fetches only the first page (API-side pagination).
 * When omitted, fetches all pages (legacy; avoid for initial load).
 */
export async function fetchProductsForWarehouse(
  wid: string,
  opts?: { signal?: AbortSignal; timeoutMs?: number; initialPageSize?: number }
): Promise<{ list: Product[]; total?: number }> {
  const initialOnly = opts?.initialPageSize != null && opts.initialPageSize > 0;
  const pageLimit = initialOnly ? Math.min(opts!.initialPageSize!, 250) : 250;
  const PRODUCTS_REQUEST_TIMEOUT_MS = 55_000;
  const getOpts = { signal: opts?.signal, timeoutMs: opts?.timeoutMs ?? PRODUCTS_REQUEST_TIMEOUT_MS, maxRetries: 3 };
  const allItems: Product[] = [];
  let totalFromApi: number | undefined;
  const apiBase = '/api/products';
  const adminBase = '/admin/api/products';
  let offset = 0;
  for (;;) {
    const viewSuffix = initialOnly ? '&view=list' : '';
    const safeOffset = Number(offset) || 0;
    const path = `${apiBase}?warehouse_id=${encodeURIComponent(wid)}&limit=${pageLimit}&offset=${safeOffset}${viewSuffix}`;
    const adminPath = `${adminBase}?warehouse_id=${encodeURIComponent(wid)}&limit=${pageLimit}&offset=${safeOffset}${viewSuffix}`;
    let raw: { data?: Product[]; total?: number } | Product[] | null = null;
    try {
      raw = await apiGet<{ data?: Product[]; total?: number } | Product[]>(API_BASE_URL, path, getOpts);
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (status === 404) {
        raw = await apiGet<{ data?: Product[]; total?: number } | Product[]>(API_BASE_URL, adminPath, getOpts);
      } else {
        throw e;
      }
    }
    const parsed = parseProductsResponse(raw);
    if (!parsed.success) throw new Error(parsed.message);
    const page = parsed.items
      .filter((p) => p != null && typeof p === 'object')
      .map((p) => normalizeProductRow(p))
      .filter((p): p is Product => p != null && typeof p === 'object');
    allItems.push(...page);
    if (raw != null && typeof raw === 'object' && 'total' in raw) totalFromApi = (raw as { total?: number }).total;
    if (initialOnly || page.length < pageLimit || (typeof totalFromApi === 'number' && allItems.length >= totalFromApi)) break;
    offset += pageLimit;
  }
  return { list: allItems, total: totalFromApi };
}

/** Seed/placeholder product ID that may exist in cache but not on production API; skip verify to avoid 404. */
const SEED_PLACEHOLDER_PRODUCT_ID = '00000000-0000-0000-0000-000000000101';

/** True when quantityBySize is exactly one row and it's the RPC fallback "One size" / "ONESIZE" (so we should prefer cache's real sizes). */
function isOnlySyntheticOneSize(quantityBySize: unknown): boolean {
  if (!Array.isArray(quantityBySize) || quantityBySize.length !== 1) return false;
  const code = String((quantityBySize[0] as { sizeCode?: string })?.sizeCode ?? '').trim().replace(/\s+/g, '').toUpperCase();
  return code === 'ONESIZE' || code === 'ONE_SIZE';
}

import { saveProductsToDb, isIndexedDBAvailable } from '../lib/offlineDb';
import { reportError } from '../lib/errorReporting';
import { useInventoryRealtime } from '../hooks/useInventoryRealtime';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { isOfflineEnabled } from '../lib/offlineFeatureFlag';
import {
  logInventoryCreate,
  logInventoryUpdate,
  logInventoryDelete,
} from '../lib/inventoryLogger';

interface InventoryContextType {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { warehouseId?: string }) => Promise<string>;
  updateProduct: (id: string, updates: Partial<Product> & { warehouseId?: string }) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  deleteProducts: (ids: string[]) => Promise<void>;
  undoAddProduct: (productId: string) => Promise<void>;
  getProduct: (id: string) => Product | undefined;
  searchProducts: (query: string) => Product[];
  filterProducts: (filters: ProductFilters) => Product[];
  refreshProducts: (options?: { silent?: boolean; bypassCache?: boolean; timeoutMs?: number }) => Promise<void>;
  /** True when more products are available from the server (pagination). */
  hasMore: boolean;
  /** Load next page of products (50 per page). No-op when !hasMore or when already loading more. */
  loadMore: () => Promise<void>;
  /** True while the next page is being fetched (Load more in progress). */
  isLoadingMore: boolean;
  /** True when a background (silent) refresh is in progress — show "Updating..." indicator. */
  isBackgroundRefreshing: boolean;
  /** Push products that exist only in this browser's storage to the API so they appear everywhere. */
  syncLocalInventoryToApi: () => Promise<{ synced: number; failed: number; total: number; syncedIds: string[] }>;
  /** Number of products that exist only on this device (not yet on server). Always 0 when API is source of truth. */
  unsyncedCount: number;
  /** Last time product list was successfully loaded from server (for "Updated X ago"). */
  lastSyncAt: Date | null;
  /** True if this product id was saved only locally (API failed). Use to show "Local only" badge. */
  isUnsynced: (productId: string) => boolean;
  /** Re-fetch product from server to check if it was saved. Returns { saved, product }. If saved, updates local state and clears unsynced flag. */
  verifyProductSaved: (productId: string) => Promise<{ saved: boolean; product?: Product }>;
  /** True if the last attempt to save inventory to this device's local storage failed (e.g. private mode, quota). */
  storagePersistFailed: boolean;
  /** Current save phase for product form: idle | saving | verifying. Use for button label (Saving… / Verifying…). */
  savePhase: 'idle' | 'saving' | 'verifying';
}

export interface ProductFilters {
  category?: string;
  minQuantity?: number;
  maxQuantity?: number;
  lowStock?: boolean;
  outOfStock?: boolean;
  tag?: string;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

/** Message thrown when addProduct saves locally due to API failure. UI closes modal and shows warning toast. */
export const ADD_PRODUCT_SAVED_LOCALLY =
  'Product saved locally. It will sync to the server when connection is available.';

/** Phase 6: Single warehouse ID only. No sentinel, no placeholder logic. */

export function InventoryProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { currentWarehouseId } = useWarehouse();
  const { showToast } = useToast();
  const { tryRefreshSession } = useAuth();
  /** Phase 6: Single warehouse ID. No sentinel, no placeholder, no label checks. */
  const warehouseId = (currentWarehouseId?.trim?.() && currentWarehouseId) ? currentWarehouseId.trim() : '';

  // Feature flag: when off, use API-only (state); when on, use offline hook (Dexie). INTEGRATION_PLAN Phase 5/7.
  const offlineEnabled = isOfflineEnabled();
  const offline = useOfflineInventory();
  const offlineRef = useRef(offline);
  offlineRef.current = offline;
  const warehouseIdRef = useRef(warehouseId);
  useEffect(() => {
    warehouseIdRef.current = warehouseId;
  }, [warehouseId]);
  const lastUpdatedProductRef = useRef<{ product: Product; at: number } | null>(null);
  const recentlyDeletedIdsRef = useRef<Set<string>>(new Set());
  /** Keep last non-empty quantityBySize per product so refetches that temporarily return empty don't flash "No sizes recorded". */
  const lastQuantityBySizeRef = useRef<Map<string, { sizeCode: string; quantity: number }[]>>(new Map());
  const RECENT_UPDATE_WINDOW_MS = 10 * 60 * 1000;
  const RECENT_DELETE_WINDOW_MS = 15_000;

  const PRODUCTS_QUERY_STALE_MS = 60_000;
  const PRODUCTS_QUERY_GC_MS = 300_000;
  const productsQuery = useQuery({
    queryKey: queryKeys.products(warehouseId),
    queryFn: ({ signal }) =>
      fetchProductsForWarehouse(warehouseId, { signal, initialPageSize: INITIAL_PRODUCTS_PAGE_SIZE }),
    enabled: isValidWarehouseId(warehouseId),
    staleTime: PRODUCTS_QUERY_STALE_MS,
    gcTime: PRODUCTS_QUERY_GC_MS,
    retry: 2,
  });
  const queryList = productsQuery.data?.list ?? [];
  const queryError = productsQuery.error;
  const queryTotal = productsQuery.data?.total;

  const products = useMemo((): Product[] => {
    const base = offlineEnabled ? (offline.products ?? []) : queryList;
    const updated = lastUpdatedProductRef.current;
    let list = base;
    if (updated && Date.now() - updated.at < RECENT_UPDATE_WINDOW_MS) {
      list = list.map((p) => (p.id === updated.product.id ? updated.product : p));
    }
    list = list.filter((p) => !recentlyDeletedIdsRef.current.has(p.id));
    // Preserve last known quantityBySize when refetch returns empty for sized products (avoids "No sizes recorded" flash).
    const prevSizes = lastQuantityBySizeRef.current;
    return list.map((p) => {
      if (p.sizeKind !== 'sized') return p;
      const qbs = p.quantityBySize ?? [];
      if (qbs.length > 0) return p;
      const kept = prevSizes.get(p.id);
      if (!kept || kept.length === 0) return p;
      return { ...p, quantityBySize: kept };
    });
  }, [offlineEnabled, offline.products, queryList]);

  useEffect(() => {
    products.forEach((p) => {
      const qbs = p.quantityBySize;
      if (p.sizeKind === 'sized' && Array.isArray(qbs) && qbs.length > 0) {
        lastQuantityBySizeRef.current.set(
          p.id,
          qbs.map((r) => ({ sizeCode: r.sizeCode, quantity: r.quantity }))
        );
      }
    });
  }, [products]);

  const prevWarehouseIdRef = useRef(warehouseId);
  useEffect(() => {
    if (prevWarehouseIdRef.current !== warehouseId) {
      lastQuantityBySizeRef.current.clear();
      prevWarehouseIdRef.current = warehouseId;
    }
  }, [warehouseId]);

  /** Merge in client-saved images so they stay visible even when API/refresh omits them. */
  const productsWithLocalImages = useMemo(
    () =>
      products.map((p) => ({
        ...p,
        images: getProductImages(p.id) ?? (Array.isArray(p.images) ? p.images : []),
      })),
    [products]
  );
  const productsRef = useRef<Product[]>([]);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const isLoading = offlineEnabled ? offline.isLoading : productsQuery.isLoading;
  const unsyncedCountFromHook = offline.unsyncedCount ?? 0;

  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const [localOnlyIds, setLocalOnlyIds] = useState<Set<string>>(() => new Set());
  const [storagePersistFailed] = useState(false);
  const [savePhase, setSavePhase] = useState<'idle' | 'saving' | 'verifying'>('idle');
  const isBackgroundRefreshing = !offlineEnabled && (productsQuery.isFetching && !productsQuery.isLoading);
  const productsTotal = offlineEnabled ? null : (queryTotal ?? null);
  const lastSyncAt = productsQuery.dataUpdatedAt ? new Date(productsQuery.dataUpdatedAt) : null;
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const syncRef = useRef<(() => Promise<{ synced: number; failed: number; total: number; syncedIds: string[] }>) | null>(null);

  // Only show error after all retries failed (not while a fetch/retry is in progress), so we don't flash "Invalid products response" before a retry succeeds.
  useEffect(() => {
    if (offlineEnabled) return;
    if (productsQuery.isSuccess) setError(null);
    else if (queryError && !productsQuery.isFetching) setError(queryError instanceof Error ? queryError.message : String(queryError));
  }, [offlineEnabled, queryError, productsQuery.isSuccess, productsQuery.isFetching]);

  const setProductsQueryData = useCallback(
    (updater: (old: { list: Product[]; total?: number } | undefined) => { list: Product[]; total?: number }) => {
      if (!isValidWarehouseId(warehouseId)) return;
      queryClient.setQueryData(queryKeys.products(warehouseId), updater);
    },
    [queryClient, warehouseId]
  );
  const lastAddedProductRef = useRef<{ product: Product; at: number } | null>(null);
  const lastSizeUpdateAtRef = useRef<number>(0);

  const productsPath = (base: string, opts?: { limit?: number; offset?: number; q?: string; category?: string; low_stock?: boolean; out_of_stock?: boolean }) => {
    const params = new URLSearchParams();
    params.set('warehouse_id', warehouseId);
    if (opts?.limit != null) params.set('limit', String(opts.limit));
    if (opts?.offset != null) params.set('offset', String(opts.offset));
    if (opts?.q) params.set('q', opts.q);
    if (opts?.category) params.set('category', opts.category);
    if (opts?.low_stock) params.set('low_stock', 'true');
    if (opts?.out_of_stock) params.set('out_of_stock', 'true');
    const qs = params.toString();
    return `${base}${base.includes('?') ? '&' : '?'}${qs}`;
  };

  /**
   * Clear old mock data from localStorage (transactions/orders only).
   * Never touch warehouse_products — user-recorded inventory must persist forever.
   */
  const clearMockData = () => {
    if (!isStorageAvailable()) return;
    const keysToRemove = ['transactions', 'orders', 'offline_transactions'];
    
    keysToRemove.forEach(key => {
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          
          // Check if it's an array (products, orders, transactions)
          if (Array.isArray(parsed)) {
            // Check if it contains mock data indicators
            const isMockData = parsed.some((item: any) => 
              item.sku?.includes('SKU-2024') || 
              item.createdBy === 'admin' ||
              item.createdBy === 'manager' ||
              item.createdBy === 'cashier' ||
              (item.sku && item.sku.startsWith('SKU-2024'))
            );
            
            if (isMockData) {
              localStorage.removeItem(key);
            }
          } else if (parsed && typeof parsed === 'object') {
            // For single objects, check if they have mock indicators
            if (parsed.sku?.includes('SKU-2024') || parsed.createdBy === 'admin') {
              localStorage.removeItem(key);
            }
          }
        } catch (e) {
          // Invalid JSON, remove it
          localStorage.removeItem(key);
        }
      }
    });
  };

  /** Normalize product from API or localStorage: dates, location, images array, and numeric fields so list and totals are accurate. */
  /** Always set sizeKind and quantityBySize so Sizes column/card never show blank for One size / Multiple sizes. */
  const normalizeProduct = (p: any): Product => {
    const rawSizes = p.quantityBySize ?? p.quantity_by_size;
    return normalizeProductLocation({
      ...p,
      images: Array.isArray(p.images) ? p.images : [],
      quantity: Number(p.quantity ?? 0) || 0,
      costPrice: Number(p.costPrice ?? p.cost_price ?? 0) || 0,
      sellingPrice: Number(p.sellingPrice ?? p.selling_price ?? 0) || 0,
      reorderLevel: Number(p.reorderLevel ?? p.reorder_level ?? 0) || 0,
      createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
      updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date(),
      expiryDate: p.expiryDate ? new Date(p.expiryDate) : null,
      sizeKind: (p.sizeKind ?? p.size_kind ?? 'na') as 'na' | 'one_size' | 'sized',
      quantityBySize: normalizeQuantityBySize(rawSizes),
    });
  };

  const LOAD_MORE_PAGE_SIZE = 250;

  /** Load next page (250 items). No-op when offline, when no more data, or when already loading. */
  const loadMore = useCallback(async () => {
    if (offlineEnabled || isLoadingMore) return;
    const current = productsRef.current;
    const total = productsTotal;
    const hasMore = total === null || current.length < total;
    if (!hasMore) return;
    setIsLoadingMore(true);
    try {
      const offset = current.length;
      const path = productsPath('/api/products', { limit: LOAD_MORE_PAGE_SIZE, offset });
      let raw: { data?: Product[]; total?: number } | Product[] | null = null;
      try {
        raw = await apiGet<{ data?: Product[]; total?: number } | Product[]>(API_BASE_URL, path, { maxRetries: 2 });
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 404) {
          raw = await apiGet<{ data?: Product[]; total?: number } | Product[]>(API_BASE_URL, productsPath('/admin/api/products', { limit: LOAD_MORE_PAGE_SIZE, offset }), { maxRetries: 2 });
        } else {
          throw e;
        }
      }
      const parsed = parseProductsResponse(raw);
      if (!parsed.success || parsed.items.length === 0) {
        if (typeof (raw as { total?: number } | null)?.total === 'number') {
          setProductsQueryData((old) => ({ list: old?.list ?? [], total: (raw as { total: number }).total }));
        }
        return;
      }
      const nextItems = parsed.items
        .filter((p) => p != null && typeof p === 'object')
        .map((p) => normalizeProduct(p))
        .filter((p): p is Product => p != null && typeof p === 'object');
      const totalFromApi = raw != null && typeof raw === 'object' && 'total' in raw ? (raw as { total?: number }).total : undefined;
      setProductsQueryData((old) => ({
        list: [...(old?.list ?? []), ...nextItems],
        total: typeof totalFromApi === 'number' ? totalFromApi : old?.total,
      }));
    } catch {
      // Leave hasMore as-is; user can retry
    } finally {
      setIsLoadingMore(false);
    }
  }, [offlineEnabled, isLoadingMore, productsTotal, productsPath, setProductsQueryData]);

  const hasMore = !offlineEnabled && (productsTotal === null || products.length < productsTotal);

  useEffect(() => {
    clearMockData();
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const invalidateProducts = useCallback(() => {
    if (isValidWarehouseId(warehouseId)) {
      queryClient.invalidateQueries({ queryKey: queryKeys.products(warehouseId) });
    }
  }, [queryClient, warehouseId]);

  useInventoryRealtime(warehouseId, { onRefetch: invalidateProducts });
  useRealtimeSync({ onSync: invalidateProducts, intervalMs: 30_000 });

  // When tab becomes visible (e.g. user returns from another device/browser), invalidate all list caches so mobile/desktop stay in sync.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['sales'] });
        queryClient.invalidateQueries({ queryKey: ['pos-products'] });
        queryClient.invalidateQueries({ queryKey: ['reports'] });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [queryClient]);

  useEffect(() => {
    const onRetry = () => invalidateProducts();
    window.addEventListener('circuit-retry', onRetry);
    return () => window.removeEventListener('circuit-retry', onRetry);
  }, [invalidateProducts]);

  /** Single-product path for GET/DELETE: query params (Vercel-safe; path /api/products/:id not routed). */
  const productByIdPath = (base: string, productId: string) => {
    const params = new URLSearchParams();
    params.set('id', productId);
    params.set('warehouse_id', warehouseId);
    return `${base}?${params.toString()}`;
  };

  /** Path for PUT/PATCH product. Main API uses /api/products/:id; admin uses base with id in body. */
  const productUpdatePath = (base: string, productId: string) =>
    base.includes('/admin/') ? base : `${base}/${productId}`;

  /** Minimal payload for API POST/PUT: only fields backend persists. Reduces payload size and avoids sending UI-only data. */
  /** When omitImagesForSync is true, images are sent as [] to avoid 413 (payload too large) from base64 images exceeding Vercel's body limit. */
  const productToPayload = (product: Product, options?: { omitImagesForSync?: boolean }): Record<string, unknown> => {
    const toIso = (d: Date | string | null | undefined) =>
      d instanceof Date ? d.toISOString() : d ?? null;
    const images = options?.omitImagesForSync
      ? []
      : (Array.isArray(product.images) ? product.images : []);
    return {
      id: product.id,
      sku: product.sku ?? '',
      barcode: product.barcode ?? '',
      name: product.name ?? '',
      description: product.description ?? '',
      category: product.category ?? '',
      tags: Array.isArray(product.tags) ? product.tags : [],
      quantity: Number(product.quantity ?? 0) || 0,
      costPrice: Number(product.costPrice ?? 0) || 0,
      sellingPrice: Number(product.sellingPrice ?? 0) || 0,
      reorderLevel: Number(product.reorderLevel ?? 0) || 0,
      location: product.location && typeof product.location === 'object' ? product.location : { warehouse: '', aisle: '', rack: '', bin: '' },
      supplier: product.supplier && typeof product.supplier === 'object' ? product.supplier : { name: '', contact: '', email: '' },
      images,
      expiryDate: toIso(product.expiryDate ?? null),
      createdBy: product.createdBy ?? '',
      createdAt: toIso(product.createdAt),
      updatedAt: toIso(product.updatedAt),
      ...(product.version !== undefined && { version: product.version }),
      sizeKind: product.sizeKind ?? 'na',
      quantityBySize: Array.isArray(product.quantityBySize) ? product.quantityBySize : [],
      ...((product as Product & { warehouseId?: string }).warehouseId != null && { warehouseId: (product as Product & { warehouseId?: string }).warehouseId }),
    };
  };

  /**
   * Push products that exist only in this browser's storage to the API
   * so they appear in all browsers/devices. Returns syncedIds so we can clear localOnlyIds.
   */
  const syncLocalInventoryToApi = async (): Promise<{ synced: number; failed: number; total: number; syncedIds: string[] }> => {
    let apiIds = new Set<string>();
    try {
      try {
        const res = await apiGet<{ data?: any[] } | any[]>(API_BASE_URL, productsPath('/admin/api/products'));
        const list = Array.isArray(res) ? res : (res && typeof res === 'object' && Array.isArray((res as { data?: any[] }).data) ? (res as { data: any[] }).data : []);
        apiIds = new Set(list.map((p: any) => p.id));
      } catch {
        const res = await apiGet<{ data?: any[] } | any[]>(API_BASE_URL, productsPath('/api/products'));
        const list = Array.isArray(res) ? res : (res && typeof res === 'object' && Array.isArray((res as { data?: any[] }).data) ? (res as { data: any[] }).data : []);
        apiIds = new Set(list.map((p: any) => p.id));
      }
    } catch {
      return { synced: 0, failed: 0, total: 0, syncedIds: [] };
    }

    const localRaw = getStoredData<any[]>('warehouse_products', []);
    const localProducts = (Array.isArray(localRaw) ? localRaw : []).map((p: any) => normalizeProduct(p));
    const localOnly = localProducts.filter((p) => !apiIds.has(p.id));
    const total = localOnly.length;
    if (total === 0) return { synced: 0, failed: 0, total: 0, syncedIds: [] };

    const CONCURRENCY = 5;
    const syncedIds: string[] = [];
    let failed = 0;
    const runOne = async (product: Product): Promise<boolean> => {
      try {
        const payload = productToPayload(product, { omitImagesForSync: true });
        try {
          await apiPost(API_BASE_URL, '/admin/api/products', payload);
        } catch {
          await apiPost(API_BASE_URL, '/api/products', payload);
        }
        return true;
      } catch {
        return false;
      }
    };
    for (let i = 0; i < localOnly.length; i += CONCURRENCY) {
      const chunk = localOnly.slice(i, i + CONCURRENCY);
      const results = await Promise.all(chunk.map((p) => runOne(p)));
      chunk.forEach((p, j) => {
        if (results[j]) {
          syncedIds.push(p.id);
        } else {
          failed++;
        }
      });
    }
    const synced = syncedIds.length;
    if (syncedIds.length > 0) setLocalOnlyIds((prev) => {
      const next = new Set(prev);
      syncedIds.forEach((id) => next.delete(id));
      return next;
    });
    invalidateProducts();
    await queryClient.refetchQueries({ queryKey: queryKeys.products(warehouseId) });
    return { synced, failed, total, syncedIds };
  };

  syncRef.current = syncLocalInventoryToApi;
  useEffect(() => {
    if (localOnlyIds.size === 0) return;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      syncRef.current?.().catch(() => {});
    }, 120_000);
    return () => clearInterval(interval);
  }, [localOnlyIds.size]);

  /**
   * Add product: offline-first when enabled; API-only uses true optimistic UI (Phase 4).
   * Optimistic (API-only): insert temp with _pending, then on success replace with server item; on failure remove temp and show error. No full refetch.
   * @returns The new product id (for undo when offline).
   */
  const addProduct = async (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { warehouseId?: string }): Promise<string> => {
    if (!productData?.name?.trim?.()) throw new Error('Product name is required');
    const newSku = String(productData.sku ?? '').trim();
    if (newSku) {
      const exists = products.some((p) => String(p.sku ?? '').trim().toLowerCase() === newSku.toLowerCase());
      if (exists) throw new Error('A product with this SKU already exists. Use a unique SKU or edit the existing product.');
    }
    const SAVE_TIMEOUT_MS = 10_000;
    if (import.meta.env?.DEV) {
      console.time('Total Save Time');
      console.time('Data Preparation');
    }
    setSavePhase('saving');
    setError(null);
    try {
      if (offlineEnabled) {
        const id = await offline.addProduct(productData);
        const imgs = Array.isArray(productData.images) ? productData.images : [];
        if (imgs.length > 0) setProductImages(id, imgs);
        const addedProduct: Product = { ...productData, id, createdAt: new Date(), updatedAt: new Date() } as Product;
        lastAddedProductRef.current = { product: addedProduct, at: Date.now() };
        logInventoryCreate({ productId: id, sku: productData.sku ?? '', listLength: products.length + 1 });
        showToast('success', 'Product saved. Syncing to server when online.');
        return id;
      }
      if (!getApiCircuitBreaker('products').allowRequest()) {
        throw new Error('Server is temporarily unavailable. Writes disabled until connection is restored.');
      }
      const tempId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const tempProduct: Product = {
        ...productData,
        id: tempId,
        createdAt: new Date(),
        updatedAt: new Date(),
        _pending: true,
      } as Product;
      setProductsQueryData((old) => ({ list: [tempProduct, ...(old?.list ?? [])], total: old?.total }));
      const payload: Record<string, unknown> = productToPayload({ ...tempProduct, _pending: undefined } as Product);
      if (productData.warehouseId?.trim()) payload.warehouseId = productData.warehouseId.trim();
      if (import.meta.env?.DEV) {
        console.timeEnd('Data Preparation');
        console.time('API Request');
      }
      const postProduct = async (): Promise<Record<string, unknown> | null> => {
        const postOpts = { timeoutMs: SAVE_TIMEOUT_MS, idempotencyKey: tempId };
        try {
          return (await apiPost<Record<string, unknown>>(API_BASE_URL, productsPath('/admin/api/products'), payload, postOpts)) ?? null;
        } catch {
          return (await apiPost<Record<string, unknown>>(API_BASE_URL, productsPath('/api/products'), payload, postOpts)) ?? null;
        }
      };
      let created: Record<string, unknown> | null = null;
      try {
        created = await postProduct();
      } catch (firstErr) {
        setProductsQueryData((old) => ({ list: (old?.list ?? []).filter((p) => p.id !== tempId), total: old?.total }));
        throw firstErr;
      }
      if (created === null) {
        setProductsQueryData((old) => ({ list: (old?.list ?? []).filter((p) => p.id !== tempId), total: old?.total }));
        throw new Error('Failed to save product');
      }
      if (import.meta.env?.DEV) {
        console.timeEnd('API Request');
        console.time('State Update');
      }
      let normalized = (created as { id?: string }).id
        ? normalizeProduct(created as Record<string, unknown>)
        : ({ ...tempProduct, _pending: undefined, id: tempId } as Product);
      const resolvedId = normalized.id ?? tempId;
      // Preserve form data when API omits or returns zero so every detail entered is recorded in state
      const qApi = Number(normalized.quantity ?? 0) || 0;
      const qForm = Number(productData.quantity ?? 0) || 0;
      if (qForm > 0 && qApi === 0) {
        normalized = { ...normalized, quantity: qForm } as Product;
      }
      if (Number(productData.costPrice ?? 0) > 0 && Number(normalized.costPrice ?? 0) === 0) {
        normalized = { ...normalized, costPrice: Number(productData.costPrice) } as Product;
      }
      if (Number(productData.sellingPrice ?? 0) > 0 && Number(normalized.sellingPrice ?? 0) === 0) {
        normalized = { ...normalized, sellingPrice: Number(productData.sellingPrice) } as Product;
      }
      if (Number(productData.reorderLevel ?? 0) >= 0 && normalized.reorderLevel === undefined) {
        normalized = { ...normalized, reorderLevel: Number(productData.reorderLevel ?? 0) } as Product;
      }
      if (productData.location && typeof productData.location === 'object' && normalized.location && Object.values(normalized.location).every((v) => !v)) {
        normalized = { ...normalized, location: productData.location } as Product;
      }
      if (productData.supplier && typeof productData.supplier === 'object' && normalized.supplier && Object.values(normalized.supplier).every((v) => !v)) {
        normalized = { ...normalized, supplier: productData.supplier } as Product;
      }
      // Always apply form sizes when user submitted with sizes so list/cache never show new product without sizes (fix: sizes not showing after add)
      if (Array.isArray(productData.quantityBySize) && productData.quantityBySize.length > 0) {
        normalized = { ...normalized, quantityBySize: productData.quantityBySize } as Product;
      }
      if (productData.sizeKind) {
        normalized = { ...normalized, sizeKind: productData.sizeKind } as Product;
      }
      if (productData.warehouseId?.trim()) {
        normalized = { ...normalized, warehouseId: productData.warehouseId.trim() } as Product;
      }
      if (Array.isArray(normalized.images) && normalized.images.length > 0) setProductImages(resolvedId, normalized.images);
      lastAddedProductRef.current = { product: normalized, at: Date.now() };
      setProductsQueryData((old) => ({
        list: (old?.list ?? []).map((p) => (p.id === tempId ? normalized : p)),
        total: old?.total != null ? old.total + (old.list?.some((p) => p.id === tempId) ? 0 : 1) : undefined,
      }));
      if (isIndexedDBAvailable()) {
        const nextList = [normalized, ...(queryList.filter((p) => p.id !== tempId))];
        saveProductsToDb(nextList).catch((e) => {
          reportError(e instanceof Error ? e : new Error(String(e)), { context: 'saveProductsToDb', listLength: nextList.length });
        });
      }
      logInventoryCreate({ productId: resolvedId, sku: productData.sku ?? '', listLength: queryList.length + 1 });
      const today = new Date().toISOString().split('T')[0];
      queryClient.invalidateQueries({ queryKey: queryKeys.products(warehouseId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(warehouseId, today) });
      queryClient.refetchQueries({ queryKey: queryKeys.dashboard(warehouseId, today) });
      invalidateProducts();
      showToast('success', 'Product saved.');
      if (import.meta.env?.DEV) {
        console.timeEnd('State Update');
        console.timeEnd('Total Save Time');
      }
      return resolvedId;
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const msg =
        status === 401
          ? 'Session expired. Please log in again.'
          : err instanceof Error
            ? err.message
            : 'Failed to save product';
      showToast('error', msg);
      throw err;
    } finally {
      setSavePhase('idle');
    }
  };

  /**
   * Update product: offline-first when enabled; API-only when flag off.
   * Uses PUT response to update state immediately (no full refetch) so "Saving..." disappears quickly.
   */
  const updateProduct = async (id: string, updates: Partial<Product> & { warehouseId?: string }) => {
    const product = products.find((p: Product) => p.id === id);
    if (!product) throw new Error('Product not found');
    const payloadImages = Array.isArray(updates.images) ? updates.images : [];
    if (payloadImages.length > 0) setProductImages(id, payloadImages);
    const SAVE_TIMEOUT_MS = 10_000;
    if (import.meta.env?.DEV) {
      console.time('Total Update Time');
      console.time('API Request (update)');
    }
    setSavePhase('saving');
    setError(null);
    try {
      if (offlineEnabled) {
        await offline.updateProduct(id, updates);
        logInventoryUpdate({ productId: id, sku: product.sku });
        showToast('success', 'Product updated. Syncing to server when online.');
        return;
      }
      const updated: Product = { ...product, ...updates, updatedAt: new Date(), id: product.id };
      const isSized = updates.sizeKind === 'sized' || updated.sizeKind === 'sized';
      const payload = { ...productToPayload(updated), warehouseId: (updates.warehouseId ?? warehouseId ?? '').trim() || '' } as Record<string, unknown>;
      // Always send quantityBySize when product is sized so the server applies the new sizes (add/change/clear).
      if (isSized) {
        payload.quantityBySize = Array.isArray(updates.quantityBySize)
          ? updates.quantityBySize
          : Array.isArray(updated.quantityBySize)
            ? updated.quantityBySize
            : [];
      }
      const putProduct = async (): Promise<Record<string, unknown> | null> => {
        try {
          return (await apiPut<Record<string, unknown>>(API_BASE_URL, productUpdatePath('/admin/api/products', id), payload, { timeoutMs: SAVE_TIMEOUT_MS })) ?? null;
        } catch {
          return (await apiPut<Record<string, unknown>>(API_BASE_URL, productUpdatePath('/api/products', id), payload, { timeoutMs: SAVE_TIMEOUT_MS })) ?? null;
        }
      };
      let fromApi: Record<string, unknown> | null = null;
      try {
        fromApi = await putProduct();
      } catch (firstErr) {
        if ((firstErr as { status?: number })?.status === 401 && (await tryRefreshSession())) {
          fromApi = await putProduct();
        } else {
          throw firstErr;
        }
      }
      if (import.meta.env?.DEV) {
        console.timeEnd('API Request (update)');
        console.time('State Update (update)');
      }
      const normalized = fromApi && (fromApi as { id?: string }).id
        ? normalizeProduct(fromApi as Record<string, unknown>)
        : updated;
      const apiHasImages = Array.isArray(normalized.images) && normalized.images.length > 0;
      // Keep images from our update if API response omits them (e.g. backend doesn't return base64)
      const withImages =
        apiHasImages
          ? normalized
          : { ...normalized, images: payloadImages.length > 0 ? payloadImages : (Array.isArray(updated.images) ? updated.images : []) };
      const sizeKind = updates.sizeKind ?? (withImages as Product).sizeKind ?? 'na';
      const rawApiSizes = (withImages as Product).quantityBySize;
      const apiQuantityBySize = Array.isArray(rawApiSizes) ? rawApiSizes : [];
      const apiHasRealSizes = apiQuantityBySize.length > 0 && !isOnlySyntheticOneSize(apiQuantityBySize);
      const formSentSizes = Array.isArray(updates.quantityBySize) && updates.quantityBySize.length > 0;
      // When user saved multiple sizes: prefer API if it returned real sizes; else use form data so UI shows S/M/L immediately (avoids ONESIZE × N until refetch)
      const quantityBySize =
        apiHasRealSizes
          ? apiQuantityBySize
          : formSentSizes
            ? updates.quantityBySize!
            : apiQuantityBySize.length > 0 ? apiQuantityBySize : [];
      const finalProduct = { ...withImages, sizeKind, quantityBySize } as Product;
      const newList = products.map((p) => (p.id === id ? finalProduct : p));
      if (payloadImages.length > 0) setProductImages(id, payloadImages);
      setProductsQueryData(() => ({ list: newList, total: undefined }));
      const at = Date.now();
      lastUpdatedProductRef.current = { product: finalProduct, at };
      if (isSized) lastSizeUpdateAtRef.current = at;
      if (isIndexedDBAvailable()) {
        saveProductsToDb(newList).catch((e) => {
          reportError(e instanceof Error ? e : new Error(String(e)), { context: 'saveProductsToDb', listLength: newList.length });
        });
      }
      logInventoryUpdate({ productId: id, sku: product.sku });
      const today = new Date().toISOString().split('T')[0];
      queryClient.invalidateQueries({ queryKey: queryKeys.products(warehouseId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(warehouseId, today) });
      queryClient.refetchQueries({ queryKey: queryKeys.dashboard(warehouseId, today) });
      showToast('success', 'Product updated.');
      if (import.meta.env?.DEV) {
        console.timeEnd('State Update (update)');
        console.timeEnd('Total Update Time');
      }
      // Refetch in background so the modal can close immediately; don't await.
      const postSaveDelayMs = isSized ? 2000 : 500;
      setTimeout(() => {
        invalidateProducts();
        queryClient.refetchQueries({ queryKey: queryKeys.products(warehouseId) });
      }, postSaveDelayMs);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const msg =
        status === 404
          ? 'Product was deleted on another device. The list will refresh.'
          : status === 401
            ? 'Session expired. Please log in again.'
            : err instanceof Error
              ? err.message
              : 'Failed to update product';
      showToast('error', msg);
      throw err;
    } finally {
      setSavePhase('idle');
    }
  };

  /**
   * Delete product: offline-first when enabled; API-only when flag off.
   * On success: remove from state immediately (optimistic) then refetch in background so other tabs/devices see update on next poll.
   */
  const deleteProduct = async (id: string) => {
    try {
      if (offlineEnabled) {
        await offline.deleteProduct(id);
        logInventoryDelete({ productId: id });
        return;
      }
      try {
        await apiDelete(API_BASE_URL, productByIdPath('/admin/api/products', id));
      } catch {
        await apiDelete(API_BASE_URL, productByIdPath('/api/products', id));
      }
      logInventoryDelete({ productId: id });
      recentlyDeletedIdsRef.current.add(id);
      setTimeout(() => recentlyDeletedIdsRef.current.delete(id), RECENT_DELETE_WINDOW_MS);
      setProductsQueryData((old) => ({ list: (old?.list ?? []).filter((p) => p.id !== id), total: old?.total != null ? old.total - 1 : undefined }));
      const today = new Date().toISOString().split('T')[0];
      queryClient.invalidateQueries({ queryKey: queryKeys.products(warehouseId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(warehouseId, today) });
      queryClient.refetchQueries({ queryKey: queryKeys.dashboard(warehouseId, today) });
      invalidateProducts();
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const msg =
        status === 403
          ? "You don't have permission to delete products."
          : status === 401
            ? 'Please log in again.'
            : err instanceof Error
              ? err.message
              : 'Failed to delete product';
      showToast('error', msg);
      throw err;
    }
  };

  /**
   * Delete multiple products: offline-first when enabled; API-only when flag off.
   * On success: remove from state immediately (optimistic) then refetch in background.
   */
  const deleteProducts = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (offlineEnabled) {
      const errors: string[] = [];
      for (const id of ids) {
        try {
          await offline.deleteProduct(id);
          logInventoryDelete({ productId: id });
        } catch (err) {
          errors.push(err instanceof Error ? err.message : 'Delete failed');
        }
      }
      if (errors.length > 0) {
        throw new Error(`Failed to delete ${errors.length} product(s): ${errors[0]}`);
      }
      return;
    }
    const idSet = new Set(ids);
    for (const id of ids) {
      try {
        try {
          await apiDelete(API_BASE_URL, productByIdPath('/admin/api/products', id));
        } catch {
          await apiDelete(API_BASE_URL, productByIdPath('/api/products', id));
        }
        logInventoryDelete({ productId: id });
      } catch (err) {
        const status = (err as { status?: number })?.status;
        const msg =
          status === 403
            ? "You don't have permission to delete products."
            : status === 401
              ? 'Please log in again.'
              : err instanceof Error
                ? err.message
                : 'Delete failed';
        showToast('error', msg);
        throw err;
      }
    }
    ids.forEach((id) => {
      recentlyDeletedIdsRef.current.add(id);
      setTimeout(() => recentlyDeletedIdsRef.current.delete(id), RECENT_DELETE_WINDOW_MS);
    });
    setProductsQueryData((old) => ({ list: (old?.list ?? []).filter((p) => !idSet.has(p.id)), total: old?.total != null ? old.total - ids.length : undefined }));
    const today = new Date().toISOString().split('T')[0];
    queryClient.invalidateQueries({ queryKey: queryKeys.products(warehouseId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(warehouseId, today) });
    queryClient.refetchQueries({ queryKey: queryKeys.dashboard(warehouseId, today) });
    invalidateProducts();
  };

  const getProduct = (id: string) => {
    return products.find((p: Product) => p.id === id);
  };

  const searchProducts = (query: string) => {
    if (!query || query.trim() === '') return products;
    
    const lowercaseQuery = query.toLowerCase().trim();
    return products.filter((p: Product) => {
      if (!p) return false;
      return (
        (p.name?.toLowerCase().includes(lowercaseQuery)) ||
        (p.sku?.toLowerCase().includes(lowercaseQuery)) ||
        (p.barcode?.toLowerCase().includes(lowercaseQuery)) ||
        (p.description?.toLowerCase().includes(lowercaseQuery)) ||
        (p.tags?.some((tag: string) => tag.toLowerCase().includes(lowercaseQuery)))
      );
    });
  };

  const filterProducts = (filters: ProductFilters) => {
    return products.filter((p: Product) => {
      const qty = Number(p.quantity ?? 0) || 0;
      const reorder = Number(p.reorderLevel ?? 0) || 0;
      if (filters.category && getCategoryDisplay(p.category) !== filters.category) return false;
      if (filters.minQuantity !== undefined && qty < filters.minQuantity) return false;
      if (filters.maxQuantity !== undefined && qty > filters.maxQuantity) return false;
      if (filters.lowStock && !(qty > 0 && qty <= reorder)) return false;
      if (filters.outOfStock && qty !== 0) return false;
      if (filters.tag && !p.tags.includes(filters.tag)) return false;
      return true;
    });
  };

  const isUnsynced = (productId: string) => localOnlyIds.has(productId);

  const verifyProductSaved = async (productId: string): Promise<{ saved: boolean; product?: Product }> => {
    if (productId === SEED_PLACEHOLDER_PRODUCT_ID) return { saved: false };
    try {
      const found = await apiGet<any>(API_BASE_URL, productByIdPath('/api/products', productId));
      if (!found?.id) return { saved: false };
      const normalized = normalizeProduct(found);
      if (mountedRef.current) {
        setLocalOnlyIds((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
        setProductsQueryData((old) => ({
          list: (old?.list ?? []).map((p) => (p.id === productId ? normalized : p)),
          total: old?.total,
        }));
      }
      return { saved: true, product: normalized };
    } catch {
      try {
        const found = await apiGet<any>(API_BASE_URL, productByIdPath('/admin/api/products', productId));
        if (!found?.id) return { saved: false };
        const normalized = normalizeProduct(found);
        if (mountedRef.current) {
          setLocalOnlyIds((prev) => {
            const next = new Set(prev);
            next.delete(productId);
            return next;
          });
          setProductsQueryData((old) => ({
            list: (old?.list ?? []).map((p) => (p.id === productId ? normalized : p)),
            total: old?.total,
          }));
        }
        return { saved: true, product: normalized };
      } catch {
        return { saved: false };
      }
    }
  };

  const refreshProducts = useCallback(
    async (_options?: { silent?: boolean; bypassCache?: boolean; timeoutMs?: number }) => {
      if (offlineEnabled) return offlineRef.current.forceSync();
      setError(null);
      invalidateProducts();
      if (isValidWarehouseId(warehouseId)) {
        await queryClient.refetchQueries({ queryKey: queryKeys.products(warehouseId) });
      }
    },
    [offlineEnabled, invalidateProducts, queryClient, warehouseId]
  );

  return (
    <InventoryContext.Provider value={{
      products: productsWithLocalImages,
      isLoading,
      error,
      addProduct,
      updateProduct,
      deleteProduct,
      deleteProducts,
      undoAddProduct: offlineEnabled ? offline.undoAddProduct : async () => {},
      getProduct,
      searchProducts,
      filterProducts,
      refreshProducts,
      hasMore,
      loadMore,
      isLoadingMore,
      isBackgroundRefreshing: offlineEnabled ? offline.isSyncing : isBackgroundRefreshing,
      syncLocalInventoryToApi,
      unsyncedCount: offlineEnabled ? unsyncedCountFromHook + localOnlyIds.size : 0,
      lastSyncAt,
      isUnsynced,
      verifyProductSaved,
      storagePersistFailed,
      savePhase,
    }}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within InventoryProvider');
  }
  return context;
}
