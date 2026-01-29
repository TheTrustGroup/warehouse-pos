import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Product } from '../types';
import { setStoredData, isStorageAvailable } from '../lib/storage';
import { API_BASE_URL, getApiHeaders, handleApiResponse } from '../lib/api';
import { getCategoryDisplay, normalizeProductLocation } from '../lib/utils';

interface InventoryContextType {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  deleteProducts: (ids: string[]) => void;
  getProduct: (id: string) => Product | undefined;
  searchProducts: (query: string) => Product[];
  filterProducts: (filters: ProductFilters) => Product[];
  refreshProducts: () => Promise<void>;
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
   * Clear old mock data from localStorage
   * Detects mock data by checking for mock SKUs or demo user IDs
   */
  const clearMockData = () => {
    if (!isStorageAvailable()) return;
    
    const keysToRemove = [
      'warehouse_products',
      'transactions',
      'orders',
      'offline_transactions',
    ];
    
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

  // Load products from API
  const loadProducts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Connect to your real API
      // Try /admin/api/products first (based on discovered endpoints), fallback to /api/products
      let response = await fetch(`${API_BASE_URL}/admin/api/products`, {
        headers: getApiHeaders(),
        credentials: 'include',
      });
      
      // If 404, try standard endpoint
      if (response.status === 404) {
        response = await fetch(`${API_BASE_URL}/api/products`, {
          headers: getApiHeaders(),
          credentials: 'include',
        });
      }
      
      // Handle API response with proper error handling
      const data = await handleApiResponse<Product[]>(response);
      
      // Convert date strings back to Date objects and ensure location exists (API may omit it)
      const productsWithDates = (data || []).map((p: any) => normalizeProductLocation({
        ...p,
        createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
        updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date(),
        expiryDate: p.expiryDate ? new Date(p.expiryDate) : null,
      }));
      
      setProducts(productsWithDates);
    } catch (err) {
      console.error('Error loading products:', err);
      let message = err instanceof Error ? err.message : 'Failed to load products. Please check your connection.';
      // Show friendly message for network/connection errors (e.g. "Load failed", "Failed to fetch")
      if (/load failed|failed to fetch|network error|networkrequestfailed/i.test(message)) {
        message = 'Cannot reach the server. Check your connection and try again.';
      }
      setError(message);
      setProducts([]); // Empty array, not mock data - no localStorage fallback
    } finally {
      setIsLoading(false);
    }
  };

  // Clear mock data and load products on mount
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

  const addProduct = (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newProduct: Product = {
      ...productData,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setProducts(prev => [...prev, newProduct]);
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setProducts(prev => prev.map(p => 
      p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p
    ));
  };

  const deleteProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const deleteProducts = (ids: string[]) => {
    setProducts(prev => prev.filter(p => !ids.includes(p.id)));
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
