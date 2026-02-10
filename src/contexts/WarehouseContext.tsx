/**
 * Current warehouse (location) for inventory and POS. All product quantities and
 * POS deductions are scoped to the selected warehouse.
 *
 * IMPORTANT: /api/warehouses requires auth. We only fetch after auth is ready and
 * user is authenticated so the dropdown list loads reliably (no 401 race).
 */

import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { Warehouse } from '../types';
import { API_BASE_URL } from '../lib/api';
import { apiGet } from '../lib/apiClient';
import { useOptionalAuth } from './AuthContext';

/** Default warehouse id created by migration (Main Store). Fallback when API has no warehouses yet. */
export const DEFAULT_WAREHOUSE_ID = '00000000-0000-0000-0000-000000000001';

const STORAGE_KEY = 'warehouse_current_id';

interface WarehouseContextType {
  warehouses: Warehouse[];
  currentWarehouseId: string;
  setCurrentWarehouseId: (id: string) => void;
  currentWarehouse: Warehouse | null;
  isLoading: boolean;
  refreshWarehouses: () => Promise<void>;
  /** True when POS can sell (single warehouse auto-selected, or user selected when multiple). No silent default. */
  isWarehouseSelectedForPOS: boolean;
}

const WarehouseContext = createContext<WarehouseContextType | undefined>(undefined);

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const auth = useOptionalAuth();
  const authLoading = auth?.isLoading ?? false;
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [currentWarehouseId, setCurrentWarehouseIdState] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return stored;
    }
    return DEFAULT_WAREHOUSE_ID;
  });
  const [isLoading, setIsLoading] = useState(true);

  const refreshWarehouses = useCallback(async () => {
    try {
      const list = await apiGet<Warehouse[]>(API_BASE_URL, '/api/warehouses');
      const arr = Array.isArray(list) ? list : [];
      setWarehouses(arr);
      if (arr.length > 0) {
        setCurrentWarehouseIdState((prev) => {
          const exists = arr.some((w) => w.id === prev);
          if (exists) return prev;
          if (arr.length === 1) return arr[0].id;
          return '';
        });
      }
      // On empty list from API, keep current selection (don't clear) so products still load for default warehouse.
    } catch {
      setWarehouses([]);
      // On error (e.g. 401/network), keep currentWarehouseId so dropdown and products still work after Reload.
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch warehouses only after auth is ready and user is authenticated (API requires auth).
  // This prevents the dropdown from staying empty due to 401 when fetch ran before token was set.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    refreshWarehouses();
  }, [authLoading, isAuthenticated, refreshWarehouses]);

  useEffect(() => {
    if (typeof localStorage !== 'undefined' && currentWarehouseId) {
      localStorage.setItem(STORAGE_KEY, currentWarehouseId);
    }
  }, [currentWarehouseId]);

  const setCurrentWarehouseId = useCallback((id: string) => {
    setCurrentWarehouseIdState(id);
  }, []);

  const currentWarehouse = warehouses.find((w) => w.id === currentWarehouseId) ?? null;
  const isWarehouseSelectedForPOS = !!(
    currentWarehouseId &&
    (warehouses.length <= 1 || warehouses.some((w) => w.id === currentWarehouseId))
  );

  return (
    <WarehouseContext.Provider
      value={{
        warehouses,
        currentWarehouseId,
        setCurrentWarehouseId,
        currentWarehouse,
        isLoading,
        refreshWarehouses,
        isWarehouseSelectedForPOS,
      }}
    >
      {children}
    </WarehouseContext.Provider>
  );
}

export function useWarehouse() {
  const context = useContext(WarehouseContext);
  if (!context) {
    throw new Error('useWarehouse must be used within WarehouseProvider');
  }
  return context;
}
