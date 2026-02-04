import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Product } from '../types';
import { getStoredData, setStoredData, isStorageAvailable } from '../lib/storage';
import { API_BASE_URL } from '../lib/api';
import { apiGet, apiPost, apiPut, apiDelete, apiRequest } from '../lib/apiClient';
import { getCategoryDisplay, normalizeProductLocation } from '../lib/utils';
import { loadProductsFromDb, saveProductsToDb, isIndexedDBAvailable } from '../lib/offlineDb';
import { reportError } from '../lib/observability';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

interface InventoryContextType {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  deleteProducts: (ids: string[]) => Promise<void>;
  getProduct: (id: string) => Product | undefined;
  searchProducts: (query: string) => Product[];
  filterProducts: (filters: ProductFilters) => Product[];
  refreshProducts: () => Promise<void>;
  /** Push products that exist only in this browser's storage to the API so they appear everywhere. */
  syncLocalInventoryToApi: () => Promise<{ synced: number; failed: number; total: number }>;
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

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          data = await apiGet<Product[]>(API_BASE_URL, '/admin/api/products', { signal });
        } catch {
          data = await apiGet<Product[]>(API_BASE_URL, '/api/products', { signal });
        }
        const apiProducts = (data || []).map((p: any) => normalizeProduct(p));
        setProducts(apiProducts);
        if (isIndexedDBAvailable()) {
          saveProductsToDb(apiProducts).catch(() => {});
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

  // Single load on mount with AbortController for cleanup.
  useEffect(() => {
    clearMockData();
    const ac = new AbortController();
    loadProducts(ac.signal);
    return () => ac.abort();
  }, []);

  // Real-time: poll when tab visible so multiple tabs/devices get updates. Silent so the page doesn't flash "Loading products..." and wipe the Add Product section.
  useRealtimeSync({ onSync: () => loadProducts(undefined, { silent: true }), intervalMs: 60_000 });

  // Save to localStorage whenever products change (for offline support)
  useEffect(() => {
    if (!isLoading && products.length > 0 && isStorageAvailable()) {
      setStoredData('warehouse_products', products);
    }
  }, [products, isLoading]);

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
   * so they appear in all browsers/devices.
   */
  const syncLocalInventoryToApi = async (): Promise<{ synced: number; failed: number; total: number }> => {
    let apiIds = new Set<string>();
    try {
      try {
        const data = await apiGet<any[]>(API_BASE_URL, '/admin/api/products');
        const list = Array.isArray(data) ? data : [];
        apiIds = new Set(list.map((p: any) => p.id));
      } catch {
        const data = await apiGet<any[]>(API_BASE_URL, '/api/products');
        const list = Array.isArray(data) ? data : [];
        apiIds = new Set(list.map((p: any) => p.id));
      }
    } catch {
      return { synced: 0, failed: 0, total: 0 };
    }

    const localRaw = getStoredData<any[]>('warehouse_products', []);
    const localProducts = (Array.isArray(localRaw) ? localRaw : []).map((p: any) => normalizeProduct(p));
    const localOnly = localProducts.filter((p) => !apiIds.has(p.id));
    const total = localOnly.length;
    if (total === 0) return { synced: 0, failed: 0, total: 0 };

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
      } catch {
        failed++;
      }
    }
    await loadProducts();
    return { synced, failed, total };
  };

  /** Persist current list to localStorage and IndexedDB. */
  const persistProducts = (next: Product[]) => {
    if (isStorageAvailable() && next.length >= 0) {
      setStoredData('warehouse_products', next);
    }
    if (isIndexedDBAvailable()) {
      saveProductsToDb(next).catch(() => {});
    }
  };

  /**
   * Add product: WRITE PATH — uses resilient client (retries, circuit breaker).
   */
  const addProduct = async (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => {
    const payload = productToPayload({
      ...productData,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    let savedRaw: any = null;
    try {
      savedRaw = await apiPost<any>(API_BASE_URL, '/admin/api/products', payload);
    } catch {
      savedRaw = await apiPost<any>(API_BASE_URL, '/api/products', payload);
    }
    const saved: Product = savedRaw ? normalizeProduct(savedRaw) : normalizeProduct(payload);
    const next = [...products, saved];
    setProducts(next);
    persistProducts(next);
  };

  /**
   * Update product: WRITE PATH. Handles 409 Conflict (version/ETag) — refresh and show message.
   */
  const updateProduct = async (id: string, updates: Partial<Product>) => {
    const product = products.find(p => p.id === id);
    if (!product) {
      throw new Error('Product not found');
    }

    const updatedProduct = { ...product, ...updates, updatedAt: new Date() };
    const payload = productToPayload(updatedProduct);

    try {
      let savedRaw: any = null;
      try {
        savedRaw = await apiPut<any>(API_BASE_URL, `/admin/api/products/${id}`, payload);
      } catch (err: any) {
        if (err?.status === 409) {
          await loadProducts();
          throw new Error(
            'Someone else updated this product. The list has been refreshed — please try your change again.'
          );
        }
        throw err;
      }
      if (!savedRaw) {
        try {
          savedRaw = await apiPut<any>(API_BASE_URL, `/api/products/${id}`, payload);
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
      const saved: Product = savedRaw ? normalizeProduct(savedRaw) : normalizeProduct(updatedProduct);
      const next = products.map(p => (p.id === id ? saved : p));
      setProducts(next);
      persistProducts(next);
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

  /**
   * Delete product: WRITE PATH — uses resilient client.
   */
  const deleteProduct = async (id: string) => {
    try {
      await apiDelete(API_BASE_URL, `/admin/api/products/${id}`);
    } catch {
      await apiDelete(API_BASE_URL, `/api/products/${id}`);
    }
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
