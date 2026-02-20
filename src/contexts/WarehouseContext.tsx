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
  refreshWarehouses: (options?: { timeoutMs?: number }) => Promise<void>;
  /** True when POS can sell (single warehouse auto-selected, or user selected when multiple). No silent default. */
  isWarehouseSelectedForPOS: boolean;
  /** When true, session is bound to a warehouse; selector should be hidden/disabled in POS. */
  isWarehouseBoundToSession: boolean;
}

const WarehouseContext = createContext<WarehouseContextType | undefined>(undefined);

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const auth = useOptionalAuth();
  const authLoading = auth?.isLoading ?? false;
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const boundWarehouseId = auth?.user?.warehouseId?.trim() || undefined;
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [currentWarehouseId, setCurrentWarehouseIdState] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return stored;
    }
    return DEFAULT_WAREHOUSE_ID;
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('WarehouseProvider mounted');
  }, []);

  const refreshWarehouses = useCallback(async (options?: { timeoutMs?: number }) => {
    try {
      const list = await apiGet<Warehouse[]>(API_BASE_URL, '/api/warehouses', {
        timeoutMs: options?.timeoutMs,
      });
      const arr = Array.isArray(list) ? list : [];
      setWarehouses(arr);
      if (arr.length > 0) {
        setCurrentWarehouseIdState((prev) => {
          const bound = boundWarehouseId && arr.some((w) => w.id === boundWarehouseId) ? boundWarehouseId : null;
          if (bound) return bound;
          const exists = arr.some((w) => w.id === prev);
          if (exists) return prev;
          // Always set a valid selection so the warehouse filter/dropdown works (single or multiple warehouses).
          return arr[0].id;
        });
      }
      // On empty list from API, keep current selection (don't clear) so products still load for default warehouse.
    } catch {
      setWarehouses([]);
      // On error (e.g. 401/network), keep currentWarehouseId so dropdown and products still work after Reload.
    } finally {
      setIsLoading(false);
    }
  }, [boundWarehouseId]);

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

  // When session is bound to a warehouse, keep currentWarehouseId in sync with it (e.g. after login with binding).
  useEffect(() => {
    if (boundWarehouseId && warehouses.some((w) => w.id === boundWarehouseId)) {
      setCurrentWarehouseIdState(boundWarehouseId);
    }
  }, [boundWarehouseId, warehouses]);

  useEffect(() => {
    if (typeof localStorage !== 'undefined' && currentWarehouseId && !boundWarehouseId) {
      localStorage.setItem(STORAGE_KEY, currentWarehouseId);
    }
  }, [currentWarehouseId, boundWarehouseId]);

  const setCurrentWarehouseId = useCallback(
    (id: string) => {
      if (boundWarehouseId) return;
      setCurrentWarehouseIdState(id);
    },
    [boundWarehouseId]
  );

  const effectiveWarehouseId = boundWarehouseId || currentWarehouseId;
  const currentWarehouse = warehouses.find((w) => w.id === effectiveWarehouseId) ?? null;
  const isWarehouseSelectedForPOS = !!(
    effectiveWarehouseId &&
    (warehouses.length <= 1 || warehouses.some((w) => w.id === effectiveWarehouseId))
  );
  const isWarehouseBoundToSession = !!boundWarehouseId;

  return (
    <WarehouseContext.Provider
      value={{
        warehouses,
        currentWarehouseId: effectiveWarehouseId,
        setCurrentWarehouseId,
        currentWarehouse,
        isLoading,
        refreshWarehouses,
        isWarehouseSelectedForPOS,
        isWarehouseBoundToSession,
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
