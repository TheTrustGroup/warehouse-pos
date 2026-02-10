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
import { useWarehouse } from './WarehouseContext';
import { getCategoryDisplay, normalizeProductLocation } from '../lib/utils';
import { loadProductsFromDb, saveProductsToDb, isIndexedDBAvailable } from '../lib/offlineDb';
import { reportError } from '../lib/observability';
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
  refreshProducts: () => Promise<void>;
  /** Push products that exist only in this browser's storage to the API so they appear everywhere. */
  syncLocalInventoryToApi: () => Promise<{ synced: number; failed: number; total: number; syncedIds: string[] }>;
  /** Number of products that exist only on this device (not yet on server). Always 0 when API is source of truth. */
  unsyncedCount: number;
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
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  /** Ids of products saved only locally (API failed). Cleared when sync succeeds. Used for unsyncedCount and background sync. */
  const [localOnlyIds, setLocalOnlyIds] = useState<Set<string>>(() => new Set());
  const syncRef = useRef<(() => Promise<{ synced: number; failed: number; total: number; syncedIds: string[] }>) | null>(null);

  /** Products API path with current warehouse for quantity scope. Omit when no selection so backend uses default for list. */
  const effectiveWarehouseId = (currentWarehouseId?.trim?.() && currentWarehouseId) ? currentWarehouseId : undefined;
  const productsPath = (base: string) => effectiveWarehouseId ? `${base}${base.includes('?') ? '&' : '?'}warehouse_id=${encodeURIComponent(effectiveWarehouseId)}` : base;

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
   * Uses resilient client (retries, circuit breaker). On failure → fallback to localStorage/IndexedDB.
   * @param signal - AbortSignal for cancellation (e.g. on unmount).
   * @param options.silent - If true, do not show full-page loading (for background refresh). Default false.
   */
  const loadProducts = async (signal?: AbortSignal, options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    try {
      if (!silent) {
        setIsLoading(true);
        setError(null);
      }

      try {
        let data: Product[] | null = null;
        try {
          data = await apiGet<Product[]>(API_BASE_URL, productsPath('/admin/api/products'), { signal });
        } catch {
          data = await apiGet<Product[]>(API_BASE_URL, productsPath('/api/products'), { signal });
        }
        const apiProducts = (data || []).map((p: any) => normalizeProduct(p));
        const apiIds = new Set(apiProducts.map((p) => p.id));
        // Keep products that exist only locally (e.g. added while offline or when API failed) so inventory never vanishes
        let localOnly: Product[] = [];
        if (isStorageAvailable()) {
          try {
            const localRaw = getStoredData<any[]>('warehouse_products', []);
            const localList = Array.isArray(localRaw) ? localRaw : [];
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
        setProducts(merged);
        if (isIndexedDBAvailable()) {
          saveProductsToDb(merged).catch((e) => {
            reportError(e instanceof Error ? e : new Error(String(e)), { context: 'saveProductsToDb', listLength: merged.length });
          });
        }
        logInventoryRead({ listLength: merged.length, environment: import.meta.env.PROD ? 'production' : 'development' });
        if (isStorageAvailable() && localOnly.length > 0) {
          setStoredData('warehouse_products', merged);
        }
      } catch (apiErr) {
        if (apiErr instanceof Error && apiErr.name === 'AbortError') return;
        throw apiErr;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      reportError(err, { context: 'loadProducts' });
      const message =
        /load failed|failed to fetch|network error|networkrequestfailed|temporarily unavailable/i.test(
          err instanceof Error ? err.message : String(err)
        )
          ? 'Cannot reach the server. Check your connection and try again.'
          : err instanceof Error
            ? err.message
            : 'Failed to load products. Please check your connection.';
      if (!silent) setError(message);
      if (isIndexedDBAvailable()) {
        const fromDb = await loadProductsFromDb<any>();
        if (fromDb.length > 0) {
          setProducts(fromDb.map((p: any) => normalizeProduct(p)));
          return;
        }
      }
      const localRaw = getStoredData<any[]>('warehouse_products', []);
      const localProducts = (Array.isArray(localRaw) ? localRaw : []).map((p: any) => normalizeProduct(p));
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

    // Synchronous read: if we have localStorage cache, show it immediately (avoids "Loading products..." flash when re-entering Inventory).
    if (isStorageAvailable()) {
      try {
        const localRaw = getStoredData<any[]>('warehouse_products', []);
        const list = Array.isArray(localRaw) ? localRaw : [];
        const productsFromCache = toProducts(list);
        if (productsFromCache.length > 0) {
          setProducts(productsFromCache);
          setIsLoading(false);
          setError(null);
          hadCache = true;
        }
      } catch {
        // ignore
      }
    }

    (async () => {
      try {
        if (!hadCache && isIndexedDBAvailable()) {
          const fromDb = await loadProductsFromDb<any>();
          const list = Array.isArray(fromDb) ? fromDb : [];
          const productsFromCache = toProducts(list);
          if (productsFromCache.length > 0 && mountedRef.current) {
            setProducts(productsFromCache);
            setIsLoading(false);
            setError(null);
            hadCache = true;
          }
        }
      } catch {
        // ignore cache read errors; will do full load below
      }
      if (!mountedRef.current) return;
      await loadProducts(ac.signal, hadCache ? { silent: true } : undefined);
    })();

    return () => {
      mountedRef.current = false;
      ac.abort();
    };
  }, [currentWarehouseId]);

  // Real-time: poll when tab visible so multiple tabs/devices get updates. Silent so the page doesn't flash "Loading products..." and wipe the Add Product section.
  useRealtimeSync({ onSync: () => loadProducts(undefined, { silent: true }), intervalMs: 60_000 });

  // Save to localStorage whenever products change (for offline support)
  useEffect(() => {
    if (!isLoading && products.length > 0 && isStorageAvailable()) {
      setStoredData('warehouse_products', products);
    }
  }, [products, isLoading]);

  /**
   * Read-after-write verification: re-fetch from server and ensure the saved record exists.
   * No write is considered successful unless the record can be immediately re-queried.
   * Throws on mismatch so UI never shows "Saved" for unverified persistence.
   */
  const readAfterWriteVerify = async (productId: string): Promise<Product> => {
    let list: any[] = [];
    try {
      const data = await apiGet<any[]>(API_BASE_URL, productsPath('/admin/api/products'));
      list = Array.isArray(data) ? data : [];
    } catch {
      const data = await apiGet<any[]>(API_BASE_URL, productsPath('/api/products'));
      list = Array.isArray(data) ? data : [];
    }
    const found = list.find((p: any) => p && p.id === productId);
    if (!found) {
      logInventoryError('Read-after-write verification failed: saved product not found', {
        productId,
        listLength: list.length,
      });
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
      const data = await apiGet<any[]>(API_BASE_URL, productsPath('/admin/api/products'));
      list = Array.isArray(data) ? data : [];
    } catch {
      const data = await apiGet<any[]>(API_BASE_URL, productsPath('/api/products'));
      list = Array.isArray(data) ? data : [];
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

  /** Serialize a product for API POST/PUT (dates to ISO strings). Preserves version for optimistic locking. */
  const productToPayload = (product: Product) => ({
    ...product,
    createdAt: product.createdAt instanceof Date ? product.createdAt.toISOString() : product.createdAt,
    updatedAt: product.updatedAt instanceof Date ? product.updatedAt.toISOString() : product.updatedAt,
    expiryDate: product.expiryDate instanceof Date ? product.expiryDate.toISOString() : product.expiryDate,
    ...(product.version !== undefined && { version: product.version }),
  });

  /**
   * Push products that exist only in this browser's storage to the API
   * so they appear in all browsers/devices. Returns syncedIds so we can clear localOnlyIds.
   */
  const syncLocalInventoryToApi = async (): Promise<{ synced: number; failed: number; total: number; syncedIds: string[] }> => {
    let apiIds = new Set<string>();
    try {
      try {
        const data = await apiGet<any[]>(API_BASE_URL, productsPath('/admin/api/products'));
        const list = Array.isArray(data) ? data : [];
        apiIds = new Set(list.map((p: any) => p.id));
      } catch {
        const data = await apiGet<any[]>(API_BASE_URL, productsPath('/api/products'));
        const list = Array.isArray(data) ? data : [];
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

    const syncedIds: string[] = [];
    let synced = 0;
    let failed = 0;
    for (const product of localOnly) {
      try {
        try {
          await apiPost(API_BASE_URL, '/admin/api/products', productToPayload(product));
        } catch {
          await apiPost(API_BASE_URL, '/api/products', productToPayload(product));
        }
        synced++;
        syncedIds.push(product.id);
      } catch {
        failed++;
      }
    }
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

  /** Persist current list to localStorage and IndexedDB (best-effort cache only; server is source of truth). */
  const persistProducts = (next: Product[]) => {
    if (isStorageAvailable() && next.length >= 0) {
      setStoredData('warehouse_products', next);
    }
    if (isIndexedDBAvailable()) {
      saveProductsToDb(next).catch((e) => {
        reportError(e instanceof Error ? e : new Error(String(e)), { context: 'persistProducts', listLength: next.length });
      });
    }
  };

  /**
   * Add product: WRITE PATH. Atomic from client perspective: validate → POST with idempotency → read-after-write verify.
   * Only consider successful when DB confirms and record can be re-queried. Otherwise throw (no "Saved" without verification).
   * On API failure we save locally and throw ADD_PRODUCT_SAVED_LOCALLY so UI never shows server "Saved" for local-only.
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
    let savedRaw: any = null;
    try {
      savedRaw = await apiPost<any>(API_BASE_URL, '/admin/api/products', bodyWithWarehouse, {
        idempotencyKey: stableId,
      });
    } catch {
      try {
        savedRaw = await apiPost<any>(API_BASE_URL, '/api/products', bodyWithWarehouse, {
          idempotencyKey: stableId,
        });
      } catch {
        // API failed: save locally so the product never vanishes; do NOT show server "Saved"
        const saved: Product = normalizeProduct(payload);
        setLocalOnlyIds((prev) => new Set(prev).add(saved.id));
        setProducts((prev) => {
          const next = [...prev, saved];
          persistProducts(next);
          return next;
        });
        throw new Error(ADD_PRODUCT_SAVED_LOCALLY);
      }
    }
    const idToVerify = (savedRaw && savedRaw.id) || stableId;
    const verified = await readAfterWriteVerify(idToVerify);
    const saved: Product = verified;
    logInventoryCreate({ productId: saved.id, sku: saved.sku, listLength: products.length + 1 });
    setProducts((prev) => {
      const next = [...prev, saved];
      persistProducts(next);
      return next;
    });
  };

  /**
   * Update product: WRITE PATH. Version check (409) prevents concurrent overwrite; read-after-write ensures persistence.
   * No success without DB commit and verified re-read.
   */
  const updateProduct = async (id: string, updates: Partial<Product> & { warehouseId?: string }) => {
    const product = products.find(p => p.id === id);
    if (!product) throw new Error('Product not found');

    const updatedProduct = { ...product, ...updates, updatedAt: new Date() };
    const payload = productToPayload(updatedProduct);
    const bodyWithWarehouse = { ...payload, warehouseId: updates.warehouseId ?? currentWarehouseId };

    const doPut = async (): Promise<any> => {
      try {
        return await apiPut<any>(API_BASE_URL, `/admin/api/products/${id}`, bodyWithWarehouse);
      } catch (err: any) {
        if (err?.status === 409) {
          await loadProducts();
          throw new Error(
            'Someone else updated this product. The list has been refreshed — please try your change again.'
          );
        }
        throw err;
      }
    };

    try {
      await doPut();
    } catch (e) {
      try {
        await apiPut<any>(API_BASE_URL, `/api/products/${id}`, bodyWithWarehouse);
      } catch (err: any) {
        if (err?.status === 409) {
          await loadProducts();
          throw new Error(
            'Someone else updated this product. The list has been refreshed — please try your change again.'
          );
        }
        throw err;
      }
    }

    const verified = await readAfterWriteVerify(id);
    logInventoryUpdate({ productId: id, sku: product.sku });
    const next = products.map(p => (p.id === id ? verified : p));
    setProducts(next);
    persistProducts(next);
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
      refreshProducts: loadProducts,
      syncLocalInventoryToApi,
      unsyncedCount: localOnlyIds.size,
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
