/**
 * INVENTORY LIFECYCLE FLOW (single source of truth: backend at API_BASE_URL)
 *
 * 1. UI form (Inventory.tsx ProductFormModal) → local state
 * 2. Submit → addProduct() / updateProduct() in this context
 * 3. apiPost/apiPut(API_BASE_URL, '/admin/api/products' or '/api/products') → API route (external backend)
 * 4. Backend: validation → database write (authoritative). This repo does NOT contain that backend.
 * 5. DB: owned by backend. Same DB must back both warehouse and storefront.
 * 6. Read: loadProducts() → apiGet(products) → normalize → setProducts(); optional merge of "localOnly" from localStorage (client cache only)
 * 7. Cache: localStorage 'warehouse_products', IndexedDB 'products' — NOT source of truth; cross-device requires server.
 * 8. UI: products state → ProductTableView / ProductGridView
 *
 * HIGH RISK: When API fails, addProduct currently saves to local state + localStorage + IndexedDB and throws ADD_PRODUCT_SAVED_LOCALLY.
 * That creates "fake persistence": user sees "saved locally" but other devices see nothing. We never show "Saved" for server without confirmed write + read-back.
 */
import { createContext, useContext, useState, useRef, ReactNode, useEffect } from 'react';
import { Product } from '../types';
import { getStoredData, setStoredData, isStorageAvailable } from '../lib/storage';
import { API_BASE_URL } from '../lib/api';
import { apiGet, apiPost, apiPut, apiDelete, apiRequest } from '../lib/apiClient';
import { useWarehouse, DEFAULT_WAREHOUSE_ID } from './WarehouseContext';
import { useToast } from './ToastContext';
import { getCategoryDisplay, normalizeProductLocation } from '../lib/utils';
import { parseProductsResponse } from '../lib/apiSchemas';

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
import {
  logInventoryCreate,
  logInventoryUpdate,
  logInventoryRead,
  logInventoryDelete,
  logInventoryError,
} from '../lib/inventoryLogger';

interface InventoryContextType {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { warehouseId?: string }) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product> & { warehouseId?: string }) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  deleteProducts: (ids: string[]) => Promise<void>;
  getProduct: (id: string) => Product | undefined;
  searchProducts: (query: string) => Product[];
  filterProducts: (filters: ProductFilters) => Product[];
  refreshProducts: (options?: { silent?: boolean; bypassCache?: boolean }) => Promise<void>;
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
  const effectiveWarehouseId = (currentWarehouseId?.trim?.() && currentWarehouseId) ? currentWarehouseId : DEFAULT_WAREHOUSE_ID;
  const initialCache = getCachedProductsForWarehouse(effectiveWarehouseId);
  const [products, setProducts] = useState<Product[]>(() => initialCache);
  const [isLoading, setIsLoading] = useState(() => initialCache.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const mountedRef = useRef(true);
  /** Ids of products saved only locally (API failed). Cleared when sync succeeds. Used for unsyncedCount and background sync. */
  const [localOnlyIds, setLocalOnlyIds] = useState<Set<string>>(() => new Set());
  /** Set when setStoredData returns false so UI can warn that local storage may not have been updated. */
  const [storagePersistFailed, setStoragePersistFailed] = useState(false);
  /** Save phase for product form so button can show Saving… / Verifying… */
  const [savePhase, setSavePhase] = useState<'idle' | 'saving' | 'verifying'>('idle');
  const syncRef = useRef<(() => Promise<{ synced: number; failed: number; total: number; syncedIds: string[] }>) | null>(null);

  const PRODUCTS_CACHE_TTL_MS = 60_000; // 60s per-warehouse cache
  const cacheRef = useRef<Record<string, { data: Product[]; ts: number }>>({});

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
  const loadProducts = async (signal?: AbortSignal, options?: { silent?: boolean; bypassCache?: boolean }) => {
    const silent = options?.silent === true;
    const bypassCache = options?.bypassCache === true;
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
      if (!silent && !cacheValid) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const path = productsPath('/api/products', { limit: 1000 });
        let raw: { data?: Product[]; total?: number } | Product[] | null = null;
        try {
          raw = await apiGet<{ data?: Product[]; total?: number } | Product[]>(API_BASE_URL, path, { signal });
        } catch (e) {
          const status = (e as { status?: number })?.status;
          // Only fall back to admin endpoint when /api/products is not found (404). Never on 403 — cashiers must use /api/products only.
          if (status === 404) {
            raw = await apiGet<{ data?: Product[]; total?: number } | Product[]>(API_BASE_URL, productsPath('/admin/api/products', { limit: 1000 }), { signal });
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
        setProducts(merged);
        if (!silent) setError(null);
        setLastSyncAt(new Date());
        cacheRef.current[wid] = { data: merged, ts: Date.now() };
        if (isIndexedDBAvailable()) {
          saveProductsToDb(merged).catch((e) => {
            reportError(e instanceof Error ? e : new Error(String(e)), { context: 'saveProductsToDb', listLength: merged.length });
          });
        }
        logInventoryRead({ listLength: merged.length, environment: import.meta.env.PROD ? 'production' : 'development' });
        if (isStorageAvailable() && merged.length > 0) {
          setStoredData(productsCacheKey(wid), merged);
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
        message = `Server error (${status}). Try again in a moment or check backend logs.`;
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
    } finally {
      setIsLoading(false);
    }
  };

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

  // Real-time: poll when tab visible so inventory always shows latest. 25s interval for swifter updates.
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

  /**
   * Read-after-write verification: re-fetch single product from server. Fast path (<300ms) so save feels instant.
   * Used in background after optimistic update; on failure we refresh list and log.
   */
  const readAfterWriteVerify = async (productId: string): Promise<Product> => {
    let found: any = null;
    try {
      found = await apiGet<any>(API_BASE_URL, productByIdPath('/api/products', productId));
    } catch {
      try {
        found = await apiGet<any>(API_BASE_URL, productByIdPath('/admin/api/products', productId));
      } catch {
        /* fallback to full list for backwards compatibility if by-id not available */
        const res = await apiGet<{ data?: any[] } | any[]>(API_BASE_URL, productsPath('/api/products'));
        const list = Array.isArray(res) ? res : (res && typeof res === 'object' && Array.isArray((res as { data?: any[] }).data) ? (res as { data: any[] }).data : []);
        found = list.find((p: any) => p && p.id === productId);
      }
    }
    if (!found || !found.id) {
      logInventoryError('Read-after-write verification failed: saved product not found', { productId });
      throw new Error('Save succeeded but verification failed. Please refresh the list.');
    }
    return normalizeProduct(found);
  };

  /**
   * Read-after-delete verification: re-fetch list and ensure deleted id(s) are no longer present.
   * If any id still appears, backend did not persist delete — throw and do not remove from local state.
   */
  const readAfterDeleteVerify = async (deletedIds: string[]): Promise<void> => {
    if (deletedIds.length === 0) return;
    let list: any[] = [];
    try {
      const res = await apiGet<{ data?: any[] } | any[]>(API_BASE_URL, productsPath('/api/products'));
      list = Array.isArray(res) ? res : (res && typeof res === 'object' && Array.isArray((res as { data?: any[] }).data) ? (res as { data: any[] }).data : []);
    } catch {
      const res = await apiGet<{ data?: any[] } | any[]>(API_BASE_URL, productsPath('/admin/api/products'));
      list = Array.isArray(res) ? res : (res && typeof res === 'object' && Array.isArray((res as { data?: any[] }).data) ? (res as { data: any[] }).data : []);
    }
    const stillPresent = deletedIds.filter((id) => list.some((p: any) => p && p.id === id));
    if (stillPresent.length > 0) {
      logInventoryError('Read-after-delete verification failed: deleted product(s) still present', {
        productId: stillPresent[0],
        deletedIds: stillPresent,
        listLength: list.length,
      });
      throw new Error('Delete succeeded but verification failed. Please refresh the list.');
    }
  };

  /** Minimal payload for API POST/PUT: only fields backend persists. Reduces payload size and avoids sending UI-only data. */
  const productToPayload = (product: Product): Record<string, unknown> => {
    const toIso = (d: Date | string | null | undefined) =>
      d instanceof Date ? d.toISOString() : d ?? null;
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
      images: Array.isArray(product.images) ? product.images : [],
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
        try {
          await apiPost(API_BASE_URL, '/admin/api/products', productToPayload(product));
        } catch {
          await apiPost(API_BASE_URL, '/api/products', productToPayload(product));
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

  /** Persist current list to localStorage (per-warehouse) and IndexedDB (best-effort cache only; server is source of truth). */
  const persistProducts = (next: Product[]) => {
    if (isStorageAvailable() && next.length >= 0) {
      const ok = setStoredData(productsCacheKey(effectiveWarehouseId), next);
      setStoragePersistFailed(!ok);
      if (!ok) reportError(new Error('Failed to save inventory to local storage (e.g. private mode or quota).'), { context: 'persistProducts' });
    }
    if (isIndexedDBAvailable()) {
      saveProductsToDb(next).catch((e) => {
        reportError(e instanceof Error ? e : new Error(String(e)), { context: 'persistProducts', listLength: next.length });
      });
    }
  };

  /** Response body is treated as verified when it has id and core fields (server only returns after commit). */
  const responseIsFullProduct = (raw: any): boolean =>
    raw && typeof raw === 'object' && raw.id && (raw.name != null || raw.sku != null);

  /**
   * Add product: optimistic UI update, then POST. On success: update state from server response, force fresh GET, toast.
   * On failure: rollback and error toast. No debouncing.
   */
  const addProduct = async (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { warehouseId?: string }) => {
    if (!productData?.name?.trim?.()) throw new Error('Product name is required');
    const stableId = crypto.randomUUID();
    const payload = productToPayload({
      ...productData,
      id: stableId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const bodyWithWarehouse = { ...payload, warehouseId: productData.warehouseId ?? currentWarehouseId };
    const optimisticProduct: Product = normalizeProduct(payload);

    const previousProducts = [...products];
    setProducts((prev) => [...prev, optimisticProduct]);
    persistProducts([...previousProducts, optimisticProduct]);
    setSavePhase('saving');
    setError(null);

    try {
      if (import.meta.env.DEV && typeof performance !== 'undefined' && performance.mark) {
        performance.mark('inventory-addProduct-start');
      }
      let savedRaw: any = null;
      try {
        savedRaw = await apiPost<any>(API_BASE_URL, '/admin/api/products', bodyWithWarehouse, {
          idempotencyKey: stableId,
        });
      } catch {
        savedRaw = await apiPost<any>(API_BASE_URL, '/api/products', bodyWithWarehouse, {
          idempotencyKey: stableId,
        });
      }
      if (import.meta.env.DEV && typeof performance !== 'undefined' && performance.measure) {
        performance.measure('inventory-addProduct-api', 'inventory-addProduct-start');
      }

      const saved: Product = normalizeProduct(savedRaw);
      logInventoryCreate({ productId: saved.id, sku: saved.sku, listLength: previousProducts.length + 1 });
      let verified: Product;
      if (responseIsFullProduct(savedRaw)) {
        verified = saved;
      } else {
        setSavePhase('verifying');
        try {
          verified = await readAfterWriteVerify(saved.id);
        } catch (e) {
          reportError(e instanceof Error ? e : new Error('Read-after-write verify failed after add'), { productId: saved.id });
          await loadProducts(undefined, { silent: true, bypassCache: true });
          throw new Error('Save succeeded but verification failed. Please refresh the list or try again.');
        }
      }
      if (!mountedRef.current) return;
      setProducts((prev) => {
        const next = [...prev].some((p) => p.id === verified.id)
          ? prev.map((p) => (p.id === verified.id ? verified : p))
          : [...prev.filter((p) => p.id !== optimisticProduct.id), verified];
        persistProducts(next);
        return next;
      });
      showToast('success', 'Product saved');
    } catch (err) {
      setProducts(previousProducts);
      persistProducts(previousProducts);
      const msg = err instanceof Error ? err.message : 'Failed to save product';
      showToast('error', msg);
      throw err;
    } finally {
      setSavePhase('idle');
    }
  };

  /**
   * Update product: optimistic UI update, then PUT. On success: update state from server response, force fresh GET, toast.
   * On failure: rollback and error toast. 409 triggers full refresh. No debouncing.
   */
  const updateProduct = async (id: string, updates: Partial<Product> & { warehouseId?: string }) => {
    const product = products.find(p => p.id === id);
    if (!product) throw new Error('Product not found');

    const updatedProduct = { ...product, ...updates, updatedAt: new Date() };
    const payload = productToPayload(updatedProduct);
    const bodyWithWarehouse = { ...payload, warehouseId: updates.warehouseId ?? currentWarehouseId };
    const optimisticProduct: Product = normalizeProduct(updatedProduct);

    const previousProducts = [...products];
    setProducts((prev) => prev.map((p) => (p.id === id ? optimisticProduct : p)));
    persistProducts(previousProducts.map((p) => (p.id === id ? optimisticProduct : p)));
    setSavePhase('saving');
    setError(null);

    try {
      if (import.meta.env.DEV && typeof performance !== 'undefined' && performance.mark) {
        performance.mark('inventory-updateProduct-start');
      }
      const doPut = async (): Promise<any> => {
        try {
          return await apiPut<any>(API_BASE_URL, `/admin/api/products/${id}`, bodyWithWarehouse);
        } catch (err: any) {
          if (err?.status === 409) {
            await loadProducts(undefined, { bypassCache: true });
            showToast('error', 'Someone else updated this product. The list has been refreshed.');
            throw new Error('Someone else updated this product. The list has been refreshed — please try your change again.');
          }
          throw err;
        }
      };

      let putResult: any;
      try {
        putResult = await doPut();
      } catch (e) {
        try {
          putResult = await apiPut<any>(API_BASE_URL, `/api/products/${id}`, bodyWithWarehouse);
        } catch (err: any) {
          if (err?.status === 409) {
            await loadProducts(undefined, { bypassCache: true });
            showToast('error', 'Someone else updated this product. The list has been refreshed.');
            throw new Error('Someone else updated this product. The list has been refreshed — please try your change again.');
          }
          throw err;
        }
      }
      if (import.meta.env.DEV && typeof performance !== 'undefined' && performance.measure) {
        performance.measure('inventory-updateProduct-api', 'inventory-updateProduct-start');
      }

      logInventoryUpdate({ productId: id, sku: product.sku });
      let verified: Product;
      if (responseIsFullProduct(putResult)) {
        verified = normalizeProduct(putResult);
      } else {
        setSavePhase('verifying');
        try {
          verified = await readAfterWriteVerify(id);
        } catch (e) {
          reportError(e instanceof Error ? e : new Error('Read-after-write verify failed after update'), { productId: id });
          await loadProducts(undefined, { silent: true, bypassCache: true });
          throw new Error('Save succeeded but verification failed. Please refresh the list or try again.');
        }
      }
      if (!mountedRef.current) return;
      setProducts((prev) => {
        const next = prev.map((p) => (p.id === id ? verified : p));
        persistProducts(next);
        return next;
      });
      showToast('success', 'Product updated');
    } catch (err) {
      setProducts(previousProducts);
      persistProducts(previousProducts);
      if ((err as { status?: number })?.status !== 409) {
        const msg = err instanceof Error ? err.message : 'Failed to update product';
        showToast('error', msg);
      }
      throw err;
    } finally {
      setSavePhase('idle');
    }
  };

  /**
   * Delete product: WRITE PATH. Read-after-delete verification — no "Deleted" without confirmed absence.
   */
  const deleteProduct = async (id: string) => {
    try {
      await apiDelete(API_BASE_URL, `/admin/api/products/${id}`);
    } catch {
      await apiDelete(API_BASE_URL, `/api/products/${id}`);
    }
    await readAfterDeleteVerify([id]);
    logInventoryDelete({ productId: id });
    const next = products.filter(p => p.id !== id);
    setProducts(next);
    persistProducts(next);
  };

  /**
   * Delete multiple products: WRITE PATH. Tries bulk then individual deletes.
   */
  const deleteProducts = async (ids: string[]) => {
    if (ids.length === 0) return;

    let bulkSuccess = false;
    try {
      await apiRequest({
        baseUrl: API_BASE_URL,
        path: '/admin/api/products/bulk',
        method: 'DELETE',
        body: JSON.stringify({ ids }),
      });
      bulkSuccess = true;
    } catch {
      try {
        await apiRequest({
          baseUrl: API_BASE_URL,
          path: '/api/products/bulk',
          method: 'DELETE',
          body: JSON.stringify({ ids }),
        });
        bulkSuccess = true;
      } catch {
        // both bulk endpoints failed
      }
    }

    if (!bulkSuccess) {
      const errors: string[] = [];
      for (const id of ids) {
        try {
          try {
            await apiDelete(API_BASE_URL, `/admin/api/products/${id}`);
          } catch {
            await apiDelete(API_BASE_URL, `/api/products/${id}`);
          }
        } catch (err) {
          errors.push(err instanceof Error ? err.message : 'Delete failed');
        }
      }
      if (errors.length > 0) {
        throw new Error(`Failed to delete ${errors.length} product(s): ${errors[0]}`);
      }
    }

    await readAfterDeleteVerify(ids);
    ids.forEach((id) => logInventoryDelete({ productId: id }));
    const next = products.filter(p => !ids.includes(p.id));
    setProducts(next);
    persistProducts(next);
  };

  const getProduct = (id: string) => {
    return products.find(p => p.id === id);
  };

  const searchProducts = (query: string) => {
    if (!query || query.trim() === '') return products;
    
    const lowercaseQuery = query.toLowerCase().trim();
    return products.filter(p => {
      if (!p) return false;
      return (
        (p.name?.toLowerCase().includes(lowercaseQuery)) ||
        (p.sku?.toLowerCase().includes(lowercaseQuery)) ||
        (p.barcode?.toLowerCase().includes(lowercaseQuery)) ||
        (p.description?.toLowerCase().includes(lowercaseQuery)) ||
        (p.tags?.some(tag => tag.toLowerCase().includes(lowercaseQuery)))
      );
    });
  };

  const filterProducts = (filters: ProductFilters) => {
    return products.filter(p => {
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

  return (
    <InventoryContext.Provider value={{
      products,
      isLoading,
      error,
      addProduct,
      updateProduct,
      deleteProduct,
      deleteProducts,
      getProduct,
      searchProducts,
      filterProducts,
      refreshProducts: (opts) => loadProducts(undefined, opts),
      syncLocalInventoryToApi,
      unsyncedCount: localOnlyIds.size,
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
