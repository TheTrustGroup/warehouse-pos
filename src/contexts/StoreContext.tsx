/**
 * Store context (Phase 3). Lists stores (API is scope-aware). Auto-selects when one store.
 * Does not replace warehouse; store is optional for multi-store clients.
 */

import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { Store } from '../types';
import { API_BASE_URL } from '../lib/api';
import { apiGet } from '../lib/apiClient';
import { useOptionalAuth } from './AuthContext';

const STORAGE_KEY = 'store_current_id';

interface StoreContextType {
  stores: Store[];
  currentStoreId: string | null;
  setCurrentStoreId: (id: string | null) => void;
  currentStore: Store | null;
  isLoading: boolean;
  refreshStores: (options?: { timeoutMs?: number }) => Promise<void>;
  /** True when user has only one store (API returned one) — selector can be hidden. */
  isSingleStore: boolean;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export function StoreProvider({ children }: { children: ReactNode }) {
  const auth = useOptionalAuth();
  const authLoading = auth?.isLoading ?? false;
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const [stores, setStores] = useState<Store[]>([]);
  const [currentStoreId, setCurrentStoreIdState] = useState<string | null>(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return stored;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(true);

  const refreshStores = useCallback(async (options?: { timeoutMs?: number }) => {
    try {
      const list = await apiGet<Store[]>(API_BASE_URL, '/api/stores', {
        timeoutMs: options?.timeoutMs,
      });
      const arr = Array.isArray(list) ? list : [];
      setStores(arr);
      if (arr.length === 1) {
        setCurrentStoreIdState(arr[0].id);
      } else if (arr.length > 0 && currentStoreId) {
        const exists = arr.some((s) => s.id === currentStoreId);
        if (!exists) setCurrentStoreIdState(arr[0].id);
      }
    } catch {
      setStores([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentStoreId]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    refreshStores();
  }, [authLoading, isAuthenticated, refreshStores]);

  useEffect(() => {
    if (typeof window !== 'undefined' && currentStoreId) {
      localStorage.setItem(STORAGE_KEY, currentStoreId);
    }
  }, [currentStoreId]);

  const setCurrentStoreId = useCallback((id: string | null) => {
    setCurrentStoreIdState(id);
  }, []);

  const currentStore = stores.find((s) => s.id === currentStoreId) ?? null;
  const isSingleStore = stores.length === 1;

  return (
    <StoreContext.Provider
      value={{
        stores,
        currentStoreId,
        setCurrentStoreId,
        currentStore,
        isLoading,
        refreshStores,
        isSingleStore,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within StoreProvider');
  }
  return context;
}
