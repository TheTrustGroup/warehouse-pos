import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Product } from '../types';
import { mockProducts } from '../services/mockData';
import { getStoredData, setStoredData, isStorageAvailable } from '../lib/storage';

interface InventoryContextType {
  products: Product[];
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  deleteProducts: (ids: string[]) => void;
  getProduct: (id: string) => Product | undefined;
  searchProducts: (query: string) => Product[];
  filterProducts: (filters: ProductFilters) => Product[];
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

  // Load from localStorage on mount
  useEffect(() => {
    if (!isStorageAvailable()) {
      console.warn('localStorage is not available. Using mock data.');
      setProducts(mockProducts);
      return;
    }

    const storedProducts = getStoredData<Product[]>('warehouse_products', []);
    
    if (storedProducts.length > 0) {
      // Convert date strings back to Date objects
      const productsWithDates = storedProducts.map((p: any) => ({
        ...p,
        createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
        updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date(),
        expiryDate: p.expiryDate ? new Date(p.expiryDate) : null,
      }));
      setProducts(productsWithDates);
    } else {
      setProducts(mockProducts);
    }
  }, []);

  // Save to localStorage whenever products change
  useEffect(() => {
    if (products.length > 0 && isStorageAvailable()) {
      setStoredData('warehouse_products', products);
    }
  }, [products]);

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
      if (filters.category && p.category !== filters.category) return false;
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
      addProduct,
      updateProduct,
      deleteProduct,
      deleteProducts,
      getProduct,
      searchProducts,
      filterProducts,
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
