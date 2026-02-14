/**
 * INVENTORY LIFECYCLE FLOW (single source of truth: backend at API_BASE_URL)
 *
 * 1. UI form → addProduct() / updateProduct()
 * 2. apiPost/apiPut(API_BASE_URL, ...) → backend; DB owned by backend.
 * 3. Read: loadProducts() → setProducts(); never clear list before fetch (Phase 2 stability).
 * 4. Cache: localStorage / IndexedDB — NOT source of truth.
 *
 * STABILITY (Phase 4): Add product uses optimistic UI — insert temp with _pending, then replace with
 * server response on success; on failure remove temp and show error. No full refetch after add.
 * No "saved" without confirmed 2xx. Offline path still uses local-first; ADD_PRODUCT_SAVED_LOCALLY for that flow.
 */
import { createContext, useContext, useState, useRef, ReactNode, useEffect, useMemo, useCallback } from 'react';
import { Product } from '../types';
import { getStoredData, setStoredData, isStorageAvailable } from '../lib/storage';
import { API_BASE_URL } from '../lib/api';
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/apiClient';
import { getApiCircuitBreaker } from '../lib/circuit';
import { useWarehouse, DEFAULT_WAREHOUSE_ID } from './WarehouseContext';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { getCategoryDisplay, normalizeProductLocation } from '../lib/utils';
import { parseProductsResponse } from '../lib/apiSchemas';
import { useInventory as useOfflineInventory } from '../hooks/useInventory';

/** Per-warehouse cache key so we can show the right list immediately on login/refresh. */
function productsCacheKey(warehouseId: string): string {
  return `warehouse_products_${warehouseId}`;
}

/** Normalize raw cache entry to Product (dates + location). Used for initial state and cache read. */
function normalizeProductFromRaw(p: any): Product {
  return normalizeProductLocation({
    ...p,
    createdAt: p?.createdAt ? new Date(p.createdAt) : new Date(),
    updatedAt: p?.updatedAt ? new Date(p.updatedAt) : new Date(),
    expiryDate: p?.expiryDate ? new Date(p.expiryDate) : null,
  });
}

/** Collect product lists from all warehouse_products_* and legacy warehouse_products keys, dedupe by id, return normalized list. Used when API fails so previous products still show. */
function getAllCachedProducts(): Product[] {
  if (typeof window === 'undefined' || !isStorageAvailable()) return [];
  try {
    const storage = window.localStorage;
    const seen = new Set<string>();
    const rawList: any[] = [];
    const legacy = getStoredData<any[]>('warehouse_products', []);
    if (Array.isArray(legacy)) rawList.push(...legacy);
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith('warehouse_products_')) {
        try {
          const item = storage.getItem(key);
          if (item) {
            const parsed = JSON.parse(item);
            if (Array.isArray(parsed)) rawList.push(...parsed);
          }
        } catch {
          /* skip */
        }
      }
    }
    const out: Product[] = [];
    for (const p of rawList) {
      if (p == null || typeof p !== 'object' || !p.id || seen.has(p.id)) continue;
      seen.add(p.id);
      try {
        out.push(normalizeProductFromRaw(p));
      } catch {
        /* skip malformed */
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Read cached product list for a warehouse (per-warehouse key + legacy fallback). If still empty, use all caches so previous products show when API is down. */
function getCachedProductsForWarehouse(warehouseId: string): Product[] {
  if (typeof window === 'undefined' || !isStorageAvailable()) return [];
  try {
    let list: any[] = getStoredData<any[]>(productsCacheKey(warehouseId), []);
    if (!Array.isArray(list)) list = [];
    if (list.length === 0) {
      const legacy = getStoredData<any[]>('warehouse_products', []);
      list = Array.isArray(legacy) ? legacy : [];
    }
    if (list.length === 0) {
      return getAllCachedProducts();
    }
    const out: Product[] = [];
    for (const p of list) {
      if (p == null || typeof p !== 'object') continue;
      try {
        out.push(normalizeProductFromRaw(p));
      } catch {
        /* skip malformed */
      }
    }
    return out;
  } catch {
    return [];
  }
}
import { loadProductsFromDb, saveProductsToDb, isIndexedDBAvailable } from '../lib/offlineDb';
import { reportError } from '../lib/errorReporting';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { isOfflineEnabled } from '../lib/offlineFeatureFlag';
import { mirrorProductsFromApi } from '../db/inventoryDB';
import {
  logInventoryCreate,
  logInventoryUpdate,
  logInventoryRead,
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

export function InventoryProvider({ children }: { children: ReactNode }) {
  const { currentWarehouseId } = useWarehouse();
  const { showToast } = useToast();
  const { tryRefreshSession } = useAuth();
  const effectiveWarehouseId = (currentWarehouseId?.trim?.() && currentWarehouseId) ? currentWarehouseId : DEFAULT_WAREHOUSE_ID;

  // Feature flag: when off, use API-only (state); when on, use offline hook (Dexie). INTEGRATION_PLAN Phase 5/7.
  const offlineEnabled = isOfflineEnabled();
  const [apiOnlyProducts, setApiOnlyProductsState] = useState<Product[]>([]);
  const [apiOnlyLoading, setApiOnlyLoadingState] = useState(true);

  const offline = useOfflineInventory();
  /** Refs to keep refreshProducts stable and avoid re-run loops when server is down (prevents list jitter). */
  const loadProductsRef = useRef<(signal?: AbortSignal, options?: { silent?: boolean; bypassCache?: boolean; timeoutMs?: number }) => Promise<void>>(() => Promise.resolve());
  const offlineRef = useRef(offline);
  offlineRef.current = offline;

  const products = useMemo(
    (): Product[] => (offlineEnabled ? (offline.products ?? []) : apiOnlyProducts),
    [offlineEnabled, offline.products, apiOnlyProducts]
  );
  const isLoading = offlineEnabled ? offline.isLoading : apiOnlyLoading;
  const unsyncedCountFromHook = offline.unsyncedCount ?? 0;

  /** When offline disabled: update API-only state. When enabled: no-op (list from Dexie). */
  const setProducts = useCallback(
    (arg: Product[] | ((prev: Product[]) => Product[])) => {
      if (!offlineEnabled) {
        setApiOnlyProductsState(typeof arg === 'function' ? (arg as (prev: Product[]) => Product[])(apiOnlyProducts) : arg);
      }
    },
    [offlineEnabled, apiOnlyProducts]
  );
  /** When offline disabled: update loading state for loadProducts. When enabled: no-op. */
  const setIsLoading = useCallback(
    (value: boolean) => {
      if (!offlineEnabled) setApiOnlyLoadingState(value);
    },
    [offlineEnabled]
  );

  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const mountedRef = useRef(true);
  /** Ids of products saved only locally (API failed). Kept for backward compat; unsyncedCount now from hook. */
  const [localOnlyIds, setLocalOnlyIds] = useState<Set<string>>(() => new Set());
  /** Set when setStoredData returns false so UI can warn that local storage may not have been updated. */
  const [storagePersistFailed, setStoragePersistFailed] = useState(false);
  /** Save phase for product form so button can show Saving… / Verifying… */
  const [savePhase, setSavePhase] = useState<'idle' | 'saving' | 'verifying'>('idle');
  /** True while a silent (background) refresh is in progress — for "Updating..." indicator. */
  const [isBackgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const syncRef = useRef<(() => Promise<{ synced: number; failed: number; total: number; syncedIds: string[] }>) | null>(null);

  // Persist current products to localStorage for legacy/fallback (products now from Dexie via hook)
  const persistProducts = useCallback(
    (next: Product[]) => {
      if (!isStorageAvailable() || !next?.length) return;
      try {
        const ok = setStoredData(productsCacheKey(effectiveWarehouseId), next);
        if (!ok) setStoragePersistFailed(true);
      } catch (e) {
        reportError(e instanceof Error ? e : new Error(String(e)), { context: 'persistProducts', listLength: next.length });
      }
    },
    [effectiveWarehouseId]
  );
  useEffect(() => {
    if (products.length > 0) persistProducts(products);
  }, [products, persistProducts]);

  const PRODUCTS_CACHE_TTL_MS = 60_000; // 60s per-warehouse cache
  const cacheRef = useRef<Record<string, { data: Product[]; ts: number }>>({});
  /** Throttle "Showing cached data" toast to once per 15s so multiple failed loads don't stack. */
  const lastCachedToastAtRef = useRef<number>(0);
  const CACHED_TOAST_COOLDOWN_MS = 15_000;
  /** Recently added product so loadProducts never overwrites and drops it; also used to pin to top to avoid jitter. */
  const lastAddedProductRef = useRef<{ product: Product; at: number } | null>(null);
  const RECENT_ADD_WINDOW_MS = 15_000;

  const productsPath = (base: string, opts?: { limit?: number; offset?: number; q?: string; category?: string; low_stock?: boolean; out_of_stock?: boolean }) => {
    const params = new URLSearchParams();
    params.set('warehouse_id', effectiveWarehouseId);
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

  /** Normalize product from API or localStorage (dates + location only). Never touch prices or quantity. */
  const normalizeProduct = (p: any): Product =>
    normalizeProductLocation({
      ...p,
      createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
      updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date(),
      expiryDate: p.expiryDate ? new Date(p.expiryDate) : null,
    });

  /**
   * Load products: SERVER IS SINGLE SOURCE OF TRUTH.
   * Uses per-warehouse cache (TTL 60s): on warehouse switch show cached list immediately and refresh in background.
   * Uses resilient client (retries, circuit breaker). On failure → fallback to localStorage/IndexedDB.
   * @param signal - AbortSignal for cancellation (e.g. on unmount).
   * @param options.silent - If true, do not show full-page loading (for background refresh). Default false.
   * @param options.bypassCache - If true, always fetch from server (e.g. when opening Inventory page for fresh data).
   */
  const loadProducts = async (signal?: AbortSignal, options?: { silent?: boolean; bypassCache?: boolean; timeoutMs?: number }) => {
    const silent = options?.silent === true;
    const bypassCache = options?.bypassCache === true;
    const timeoutMs = options?.timeoutMs;
    const wid = effectiveWarehouseId;
    const cached = cacheRef.current[wid];
    const now = Date.now();
    const cacheValid = !bypassCache && cached && (now - cached.ts) < PRODUCTS_CACHE_TTL_MS;
    if (cacheValid && cached.data.length > 0) {
      setProducts(cached.data);
      setIsLoading(false);
      setError(null);
    }
    try {
      if (silent) setBackgroundRefreshing(true);
      if (!silent && !cacheValid) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const path = productsPath('/api/products', { limit: 1000 });
        // Fail fast on server/network errors so we show cached products instead of spinning (maxRetries: 0).
        const getOpts = { signal, timeoutMs, maxRetries: 0 };
        let raw: { data?: Product[]; total?: number } | Product[] | null = null;
        try {
          raw = await apiGet<{ data?: Product[]; total?: number } | Product[]>(API_BASE_URL, path, getOpts);
        } catch (e) {
          const status = (e as { status?: number })?.status;
          // Only fall back to admin endpoint when /api/products is not found (404). Never on 403 — cashiers must use /api/products only.
          if (status === 404) {
            raw = await apiGet<{ data?: Product[]; total?: number } | Product[]>(API_BASE_URL, productsPath('/admin/api/products', { limit: 1000 }), getOpts);
          } else {
            throw e;
          }
        }
        const parsed = parseProductsResponse(raw);
        if (!parsed.success) {
          setError(parsed.message);
          return;
        }
        const apiProducts = parsed.items.map((p) => normalizeProduct(p));
        const apiIds = new Set(apiProducts.map((p) => p.id));
        // Keep products that exist only locally (e.g. added while offline or when API failed) so inventory never vanishes
        const localOnly: Product[] = [];
        if (isStorageAvailable()) {
          try {
            let localList = getStoredData<any[]>(productsCacheKey(wid), []);
            if (!Array.isArray(localList) || localList.length === 0) localList = getStoredData<any[]>('warehouse_products', []);
            if (!Array.isArray(localList)) localList = [];
            for (const p of localList) {
              if (!p || typeof p !== 'object' || !p.id || apiIds.has(p.id)) continue;
              try {
                localOnly.push(normalizeProduct(p));
                apiIds.add(p.id);
              } catch {
                /* skip malformed */
              }
            }
          } catch {
            /* ignore */
          }
        }
        const merged = [...apiProducts, ...localOnly];
        // Persistence: never show empty if we have cached data (avoid data loss from wrong warehouse or transient API empty)
        if (merged.length === 0 && (isStorageAvailable() || isIndexedDBAvailable())) {
          const toProducts = (list: any[]): Product[] => {
            const out: Product[] = [];
            for (const p of list) {
              if (p == null || typeof p !== 'object') continue;
              try {
                out.push(normalizeProduct(p));
              } catch {
                /* skip malformed */
              }
            }
            return out;
          };
          let fallback: Product[] = [];
          if (isStorageAvailable()) {
            try {
              let raw = getStoredData<any[]>(productsCacheKey(wid), []);
              if (!Array.isArray(raw) || raw.length === 0) raw = getStoredData<any[]>('warehouse_products', []);
              fallback = toProducts(Array.isArray(raw) ? raw : []);
            } catch {
              /* ignore */
            }
          }
          if (fallback.length === 0 && isIndexedDBAvailable()) {
            try {
              const fromDb = await loadProductsFromDb<any>();
              fallback = toProducts(Array.isArray(fromDb) ? fromDb : []);
            } catch {
              /* ignore */
            }
          }
          if (fallback.length === 0) {
            fallback = getAllCachedProducts();
          }
          if (fallback.length > 0) {
            setProducts(fallback);
            if (!silent) setError('Server returned no products for this warehouse. Showing last saved list.');
            logInventoryRead({ listLength: fallback.length, environment: 'cache-fallback' });
            return;
          }
        }
        let listToSet = merged;
        const recent = lastAddedProductRef.current;
        if (recent && Date.now() - recent.at < RECENT_ADD_WINDOW_MS) {
          const inMerged = merged.some((p) => p.id === recent.product.id);
          if (!inMerged) listToSet = [recent.product, ...merged];
          else {
            const pin = merged.find((p) => p.id === recent.product.id);
            if (pin) listToSet = [pin, ...merged.filter((p) => p.id !== recent.product.id)];
          }
        }
        setProducts(listToSet);
        if (!silent) setError(null);
        setLastSyncAt(new Date());
        cacheRef.current[wid] = { data: listToSet, ts: Date.now() };
        if (isIndexedDBAvailable()) {
          saveProductsToDb(listToSet).catch((e) => {
            reportError(e instanceof Error ? e : new Error(String(e)), { context: 'saveProductsToDb', listLength: listToSet.length });
          });
        }
        if (offlineEnabled) {
          mirrorProductsFromApi(merged).catch(() => {});
        }
        logInventoryRead({ listLength: listToSet.length, environment: import.meta.env.PROD ? 'production' : 'development' });
        if (isStorageAvailable() && listToSet.length > 0) {
          setStoredData(productsCacheKey(wid), listToSet);
        }
      } catch (apiErr) {
        if (apiErr instanceof Error && apiErr.name === 'AbortError') return;
        throw apiErr;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      reportError(err, { context: 'loadProducts' });
      const errMsg = err instanceof Error ? err.message : String(err);
      const status = (err as { status?: number })?.status;
      const isNetwork =
        /load failed|failed to fetch|network error|networkrequestfailed|temporarily unavailable/i.test(errMsg);
      let message: string;
      if (status === 404) {
        message =
          'Products API not found (404). Ensure the backend is deployed and VITE_API_BASE_URL points to it (e.g. in Vercel env).';
      } else if (status === 403) {
        message = 'Access denied (403). Check your login and permissions.';
      } else if (status === 401) {
        message = 'Please log in again. Session may have expired.';
      } else if (status != null && status >= 500) {
        message = `Server error (${status}) loading products. Showing cached data if available—check backend (e.g. Supabase env) and try Retry.`;
      } else if (isNetwork) {
        message = 'Cannot reach the server. Check your connection and that the backend URL is correct.';
      } else {
        message = errMsg || 'Failed to load products. Please check your connection.';
      }
      if (!silent) setError(message);
      if (isIndexedDBAvailable()) {
        const fromDb = await loadProductsFromDb<any>();
        if (fromDb.length > 0) {
          setProducts(fromDb.map((p: any) => normalizeProduct(p)));
          if (!silent) {
            setError(null);
            const now = Date.now();
            if (now - lastCachedToastAtRef.current >= CACHED_TOAST_COOLDOWN_MS) {
              lastCachedToastAtRef.current = now;
              showToast('warning', 'Showing cached data. Tap Retry to refresh.');
            }
          }
          return;
        }
      }
      let localRaw = getStoredData<any[]>(productsCacheKey(effectiveWarehouseId), []);
      if (!Array.isArray(localRaw) || localRaw.length === 0) localRaw = getStoredData<any[]>('warehouse_products', []);
      let localProducts = (Array.isArray(localRaw) ? localRaw : []).map((p: any) => normalizeProduct(p));
      if (localProducts.length === 0) {
        localProducts = getAllCachedProducts();
      }
      setProducts(localProducts);
      if (localProducts.length > 0 && !silent) {
        setError(null);
        const now = Date.now();
        if (now - lastCachedToastAtRef.current >= CACHED_TOAST_COOLDOWN_MS) {
          lastCachedToastAtRef.current = now;
          showToast('warning', 'Showing cached data. Tap Retry to refresh.');
        }
      }
    } finally {
      if (silent) setBackgroundRefreshing(false);
      setIsLoading(false);
    }
  };
  loadProductsRef.current = loadProducts;

  // On mount: show cached products immediately when available so entering Inventory doesn't show a full-screen "Loading products..." spinner. Then refresh from API (silent if we had cache).
  useEffect(() => {
    clearMockData();
    mountedRef.current = true;
    const ac = new AbortController();
    let hadCache = false;

    const toProducts = (list: any[]): Product[] => {
      const out: Product[] = [];
      for (const p of list) {
        if (p == null || typeof p !== 'object') continue;
        try {
          out.push(normalizeProduct(p));
        } catch {
          // skip malformed cache entries
        }
      }
      return out;
    };

    // Synchronous read: per-warehouse cache so the right list shows immediately on login/refresh.
    const productsFromCache = getCachedProductsForWarehouse(effectiveWarehouseId);
    if (productsFromCache.length > 0) {
      setProducts(productsFromCache);
      setIsLoading(false);
      setError(null);
      hadCache = true;
    }

    (async () => {
      // Start API fetch immediately; run IndexedDB read in parallel so we don't delay the first paint.
      const loadProductsPromise = loadProducts(ac.signal, hadCache ? { silent: true } : undefined);
      if (!hadCache && isIndexedDBAvailable()) {
        try {
          const fromDb = await loadProductsFromDb<any>();
          const list = Array.isArray(fromDb) ? fromDb : [];
          const productsFromCache = toProducts(list);
          if (productsFromCache.length > 0 && mountedRef.current) {
            setProducts(productsFromCache);
            setIsLoading(false);
            setError(null);
            hadCache = true;
          }
        } catch {
          // ignore cache read errors
        }
      }
      if (!mountedRef.current) return;
      await loadProductsPromise;
    })();

    return () => {
      mountedRef.current = false;
      ac.abort();
    };
  }, [currentWarehouseId]);

  // Real-time: poll when tab visible so inventory shows latest. 25s interval.
  useRealtimeSync({ onSync: () => loadProducts(undefined, { silent: true }), intervalMs: 25_000 });

  // When user clicks "Try again" on the server-unavailable banner, refetch products.
  useEffect(() => {
    const onRetry = () => loadProducts(undefined, { bypassCache: true });
    window.addEventListener('circuit-retry', onRetry);
    return () => window.removeEventListener('circuit-retry', onRetry);
  }, []);

  // Persist inventory per warehouse so list shows immediately on next login/refresh.
  useEffect(() => {
    if (!isLoading && products.length > 0 && isStorageAvailable()) {
      const ok = setStoredData(productsCacheKey(effectiveWarehouseId), products);
      setStoragePersistFailed(!ok);
    }
  }, [products, isLoading, effectiveWarehouseId]);

  /** Single-product path for fast verify (no full list fetch). */
  const productByIdPath = (base: string, productId: string) => {
    const params = new URLSearchParams();
    params.set('warehouse_id', effectiveWarehouseId);
    return `${base}/${productId}?${params.toString()}`;
  };

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
      quantity: product.quantity ?? 0,
      costPrice: product.costPrice ?? 0,
      sellingPrice: product.sellingPrice ?? 0,
      reorderLevel: product.reorderLevel ?? 0,
      location: product.location && typeof product.location === 'object' ? product.location : { warehouse: '', aisle: '', rack: '', bin: '' },
      supplier: product.supplier && typeof product.supplier === 'object' ? product.supplier : { name: '', contact: '', email: '' },
      images,
      expiryDate: toIso(product.expiryDate ?? null),
      createdBy: product.createdBy ?? '',
      createdAt: toIso(product.createdAt),
      updatedAt: toIso(product.updatedAt),
      ...(product.version !== undefined && { version: product.version }),
      ...(product.sizeKind && { sizeKind: product.sizeKind }),
      ...(product.quantityBySize && product.quantityBySize.length > 0 && { quantityBySize: product.quantityBySize }),
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

    let localRaw = getStoredData<any[]>(productsCacheKey(effectiveWarehouseId), []);
    if (!Array.isArray(localRaw) || localRaw.length === 0) localRaw = getStoredData<any[]>('warehouse_products', []);
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
    await loadProducts();
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
        const addedProduct: Product = { ...productData, id, createdAt: new Date(), updatedAt: new Date() } as Product;
        lastAddedProductRef.current = { product: addedProduct, at: Date.now() };
        logInventoryCreate({ productId: id, sku: productData.sku ?? '', listLength: products.length + 1 });
        showToast('success', 'Product saved. Syncing to server when online.');
        return id;
      }
      if (!getApiCircuitBreaker().allowRequest()) {
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
      setApiOnlyProductsState((prev) => [tempProduct, ...prev]);
      const payload = productToPayload({ ...tempProduct, _pending: undefined } as Product);
      if (import.meta.env?.DEV) {
        console.timeEnd('Data Preparation');
        console.time('API Request');
      }
      const postProduct = async (): Promise<Record<string, unknown> | null> => {
        try {
          return (await apiPost<Record<string, unknown>>(API_BASE_URL, productsPath('/admin/api/products'), payload, { timeoutMs: SAVE_TIMEOUT_MS })) ?? null;
        } catch {
          return (await apiPost<Record<string, unknown>>(API_BASE_URL, productsPath('/api/products'), payload, { timeoutMs: SAVE_TIMEOUT_MS })) ?? null;
        }
      };
      let created: Record<string, unknown> | null = null;
      try {
        created = await postProduct();
      } catch (firstErr) {
        setApiOnlyProductsState((prev) => prev.filter((p) => p.id !== tempId));
        throw firstErr;
      }
      if (created === null) {
        setApiOnlyProductsState((prev) => prev.filter((p) => p.id !== tempId));
        throw new Error('Failed to save product');
      }
      if (import.meta.env?.DEV) {
        console.timeEnd('API Request');
        console.time('State Update');
      }
      const normalized = (created as { id?: string }).id
        ? normalizeProduct(created as any)
        : ({ ...tempProduct, _pending: undefined, id: tempId } as Product);
      const resolvedId = normalized.id ?? tempId;
      lastAddedProductRef.current = { product: normalized, at: Date.now() };
      setApiOnlyProductsState((prev) => prev.map((p) => (p.id === tempId ? normalized : p)));
      cacheRef.current[effectiveWarehouseId] = { data: [normalized, ...apiOnlyProducts.filter((p) => p.id !== tempId)], ts: Date.now() };
      setLastSyncAt(new Date());
      if (isStorageAvailable()) {
        const nextList = [normalized, ...apiOnlyProducts.filter((p) => p.id !== tempId)];
        setStoredData(productsCacheKey(effectiveWarehouseId), nextList);
      }
      if (isIndexedDBAvailable()) {
        const nextList = [normalized, ...apiOnlyProducts.filter((p) => p.id !== tempId)];
        saveProductsToDb(nextList).catch((e) => {
          reportError(e instanceof Error ? e : new Error(String(e)), { context: 'saveProductsToDb', listLength: nextList.length });
        });
      }
      logInventoryCreate({ productId: resolvedId, sku: productData.sku ?? '', listLength: apiOnlyProducts.length + 1 });
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
      const payload = productToPayload(updated);
      const putProduct = async (): Promise<Record<string, unknown> | null> => {
        try {
          return (await apiPut<Record<string, unknown>>(API_BASE_URL, productByIdPath('/admin/api/products', id), payload, { timeoutMs: SAVE_TIMEOUT_MS })) ?? null;
        } catch {
          return (await apiPut<Record<string, unknown>>(API_BASE_URL, productByIdPath('/api/products', id), payload, { timeoutMs: SAVE_TIMEOUT_MS })) ?? null;
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
        ? normalizeProduct(fromApi as any)
        : updated;
      const newList = products.map((p) => (p.id === id ? normalized : p));
      setApiOnlyProductsState(newList);
      cacheRef.current[effectiveWarehouseId] = { data: newList, ts: Date.now() };
      if (isStorageAvailable()) setStoredData(productsCacheKey(effectiveWarehouseId), newList);
      if (isIndexedDBAvailable()) {
        saveProductsToDb(newList).catch((e) => {
          reportError(e instanceof Error ? e : new Error(String(e)), { context: 'saveProductsToDb', listLength: newList.length });
        });
      }
      setLastSyncAt(new Date());
      logInventoryUpdate({ productId: id, sku: product.sku });
      showToast('success', 'Product updated.');
      if (import.meta.env?.DEV) {
        console.timeEnd('State Update (update)');
        console.timeEnd('Total Update Time');
      }
      loadProducts(undefined, { silent: true }).catch(() => {});
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const msg =
        status === 401
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
      await loadProducts(undefined, { bypassCache: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete product';
      showToast('error', msg);
      throw err;
    }
  };

  /**
   * Delete multiple products: offline-first when enabled; API-only when flag off.
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
    for (const id of ids) {
      try {
        try {
          await apiDelete(API_BASE_URL, productByIdPath('/admin/api/products', id));
        } catch {
          await apiDelete(API_BASE_URL, productByIdPath('/api/products', id));
        }
        logInventoryDelete({ productId: id });
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Delete failed');
        throw err;
      }
    }
    await loadProducts(undefined, { bypassCache: true });
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
      if (filters.category && getCategoryDisplay(p.category) !== filters.category) return false;
      if (filters.minQuantity !== undefined && p.quantity < filters.minQuantity) return false;
      if (filters.maxQuantity !== undefined && p.quantity > filters.maxQuantity) return false;
      if (filters.lowStock && !(p.quantity > 0 && p.quantity <= p.reorderLevel)) return false;
      if (filters.outOfStock && p.quantity !== 0) return false;
      if (filters.tag && !p.tags.includes(filters.tag)) return false;
      return true;
    });
  };

  const isUnsynced = (productId: string) => localOnlyIds.has(productId);

  const verifyProductSaved = async (productId: string): Promise<{ saved: boolean; product?: Product }> => {
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
        setProducts((prev) => {
          const next = prev.map((p) => (p.id === productId ? normalized : p));
          persistProducts(next);
          return next;
        });
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
          setProducts((prev) => {
            const next = prev.map((p) => (p.id === productId ? normalized : p));
            persistProducts(next);
            return next;
          });
        }
        return { saved: true, product: normalized };
      } catch {
        return { saved: false };
      }
    }
  };

  /** Stable so Inventory page effect doesn't re-run in a loop when server is down (prevents list jitter). */
  const refreshProducts = useCallback(
    (options?: { silent?: boolean; bypassCache?: boolean; timeoutMs?: number }) => {
      if (offlineEnabled) return offlineRef.current.forceSync();
      return loadProductsRef.current(undefined, { bypassCache: true, ...options });
    },
    [offlineEnabled]
  );

  return (
    <InventoryContext.Provider value={{
      products,
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
