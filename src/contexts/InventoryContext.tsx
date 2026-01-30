import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Product } from '../types';
import { getStoredData, setStoredData, isStorageAvailable } from '../lib/storage';
import { API_BASE_URL, getApiHeaders, handleApiResponse } from '../lib/api';
import { getCategoryDisplay, normalizeProductLocation } from '../lib/utils';

interface InventoryContextType {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  deleteProducts: (ids: string[]) => void;
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
   * One fetch to API (backend must implement getInventory() → Supabase).
   * No client-side merge, SWR, React Query, or refetch logic. On success → use API response only.
   * On failure (offline) → fallback to localStorage so UI still shows something.
   */
  const loadProducts = async () => {
    try {
      setIsLoading(true);
      setError(null);

      let response = await fetch(`${API_BASE_URL}/admin/api/products`, {
        headers: getApiHeaders(),
        credentials: 'include',
        cache: 'no-store',
      });
      if (response.status === 404) {
        response = await fetch(`${API_BASE_URL}/api/products`, {
          headers: getApiHeaders(),
          credentials: 'include',
          cache: 'no-store',
        });
      }

      const data = await handleApiResponse<Product[]>(response);
      const apiProducts = (data || []).map((p: any) => normalizeProduct(p));
      // TEMP 24h: truth logging — if refresh clears UI: 0 = fetch problem, >0 = rendering/state problem
      console.log('INVENTORY READ', apiProducts.length, Date.now());
      setProducts(apiProducts);
    } catch (err) {
      console.error('Error loading products:', err);
      const message =
        /load failed|failed to fetch|network error|networkrequestfailed/i.test(
          err instanceof Error ? err.message : String(err)
        )
          ? 'Cannot reach the server. Check your connection and try again.'
          : err instanceof Error
            ? err.message
            : 'Failed to load products. Please check your connection.';
      setError(message);
      const localRaw = getStoredData<any[]>('warehouse_products', []);
      const localProducts = (Array.isArray(localRaw) ? localRaw : []).map((p: any) => normalizeProduct(p));
      console.log('INVENTORY READ', localProducts.length, Date.now(), '(fallback)');
      setProducts(localProducts);
    } finally {
      setIsLoading(false);
    }
  };

  // Single load on mount. No SWR, React Query, or client refetch logic — server is source of truth.
  useEffect(() => {
    clearMockData();
    loadProducts();
  }, []);

  // Save to localStorage whenever products change (for offline support)
  useEffect(() => {
    if (!isLoading && products.length > 0 && isStorageAvailable()) {
      setStoredData('warehouse_products', products);
    }
  }, [products, isLoading]);

  /** Serialize a product for API POST (dates to ISO strings). */
  const productToPayload = (product: Product) => ({
    ...product,
    createdAt: product.createdAt instanceof Date ? product.createdAt.toISOString() : product.createdAt,
    updatedAt: product.updatedAt instanceof Date ? product.updatedAt.toISOString() : product.updatedAt,
    expiryDate: product.expiryDate instanceof Date ? product.expiryDate.toISOString() : product.expiryDate,
  });

  /**
   * Push products that exist only in this browser's localStorage to the API
   * so they appear in all browsers/devices. Use after recording items in one
   * browser to recover them on the server and elsewhere.
   */
  const syncLocalInventoryToApi = async (): Promise<{ synced: number; failed: number; total: number }> => {
    let apiIds = new Set<string>();
    try {
      let response = await fetch(`${API_BASE_URL}/admin/api/products`, {
        headers: getApiHeaders(),
        credentials: 'include',
        cache: 'no-store',
      });
      if (response.status === 404) {
        response = await fetch(`${API_BASE_URL}/api/products`, {
          headers: getApiHeaders(),
          credentials: 'include',
          cache: 'no-store',
        });
      }
      if (response.ok) {
        const data = await response.json().catch(() => []);
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

    const opts = (body: string) => ({
      method: 'POST' as const,
      headers: getApiHeaders(),
      credentials: 'include' as const,
      body,
    });
    let synced = 0;
    let failed = 0;
    for (const product of localOnly) {
      try {
        let res = await fetch(`${API_BASE_URL}/admin/api/products`, opts(JSON.stringify(productToPayload(product))));
        if (res.status === 404) res = await fetch(`${API_BASE_URL}/api/products`, opts(JSON.stringify(productToPayload(product))));
        if (res.ok) synced++; else failed++;
      } catch {
        failed++;
      }
    }
    await loadProducts();
    return { synced, failed, total };
  };

  /** Persist current list to localStorage immediately so refresh never loses data. */
  const persistProducts = (next: Product[]) => {
    if (isStorageAvailable() && next.length >= 0) {
      setStoredData('warehouse_products', next);
    }
  };

  /**
   * Add product: WRITE PATH — UI never mutates until DB confirms.
   * POST to API first; only on success update state with saved item.
   */
  const addProduct = async (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => {
    const payload = productToPayload({
      ...productData,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    let res = await fetch(`${API_BASE_URL}/admin/api/products`, {
      method: 'POST',
      headers: getApiHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    if (res.status === 404) {
      res = await fetch(`${API_BASE_URL}/api/products`, {
        method: 'POST',
        headers: getApiHeaders(),
        credentials: 'include',
        body: JSON.stringify(payload),
        cache: 'no-store',
      });
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || 'Write failed');
    }
    const savedRaw = await res.json().catch(() => null);
    const saved: Product = savedRaw
      ? normalizeProduct(savedRaw)
      : normalizeProduct(payload);
    const next = [...products, saved];
    setProducts(next);
    persistProducts(next);
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    const next = products.map(p =>
      p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p
    );
    setProducts(next);
    persistProducts(next);
  };

  const deleteProduct = (id: string) => {
    const next = products.filter(p => p.id !== id);
    setProducts(next);
    persistProducts(next);
  };

  const deleteProducts = (ids: string[]) => {
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
