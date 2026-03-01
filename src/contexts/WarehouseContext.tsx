/**
 * Current warehouse (location) for inventory and POS. All product quantities and
 * POS deductions are scoped to the selected warehouse.
 *
 * THE FIX for "Main Town selected but Main Store stats showing":
 *   ROOT CAUSE: Dashboard was fetching warehouse_id=...0001 (Main Store) even when
 *   sidebar showed "Main Town". Sidebar, Dashboard, InventoryPage, and POS each had
 *   disconnected warehouse state.
 *   This context is the SINGLE source of truth. Every page (Dashboard, Inventory, POS)
 *   reads from here. When the sidebar changes the warehouse, ALL pages re-fetch.
 *   Selection persists to localStorage so it survives refresh.
 *
 * IMPORTANT: /api/warehouses requires auth. We only fetch after auth is ready and
 * user is authenticated so the dropdown list loads reliably (no 401 race).
 *
 * WIRING: See CURSOR_WIRING.md for exact instructions. Use useWarehouse() in every
 * component that needs the selected warehouse (Dashboard, Inventory, POS, Sidebar).
 */

import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { Warehouse } from '../types';
import { API_BASE_URL } from '../lib/api';
import { apiGet } from '../lib/apiClient';
import { useOptionalAuth } from './AuthContext';

/** Default warehouse id created by migration (Main Store). Fallback when API has no warehouses yet. */
export const DEFAULT_WAREHOUSE_ID = '00000000-0000-0000-0000-000000000001';

const STORAGE_KEY = 'warehouse_current_id';

/** DC was consolidated into Main Store; never show in UI (backend also excludes it). */
function excludeRemovedWarehouses(arr: Warehouse[]): Warehouse[] {
  return arr.filter(
    (w) => w.name !== 'DC' && (w as Warehouse & { code?: string }).code !== 'DC'
  );
}

function dedupeWarehouses(arr: Warehouse[]): Warehouse[] {
  const seen = new Set<string>();
  return arr.filter((w: Warehouse) => {
    if (seen.has(w.id)) return false;
    seen.add(w.id);
    return true;
  });
}

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
      const stored = localStorage.getItem(STORAGE_KEY)?.trim();
      if (stored && stored !== '00000000-0000-0000-0000-000000000000') return stored;
    }
    return DEFAULT_WAREHOUSE_ID;
  });
  const [isLoading, setIsLoading] = useState(true);

  const refreshWarehouses = useCallback(async (options?: { timeoutMs?: number }) => {
    try {
      const list = await apiGet<Warehouse[]>(API_BASE_URL, '/api/warehouses', {
        timeoutMs: options?.timeoutMs,
      });
      const arr = Array.isArray(list) ? list : [];
      const withoutRemoved = excludeRemovedWarehouses(arr);
      const deduped = dedupeWarehouses(withoutRemoved);
      setWarehouses(deduped);
      if (deduped.length > 0) {
        setCurrentWarehouseIdState((prev) => {
          const bound = boundWarehouseId && deduped.some((w) => w.id === boundWarehouseId) ? boundWarehouseId : null;
          if (bound) return bound;
          const exists = deduped.some((w) => w.id === prev);
          if (exists) return prev;
          // Always set a valid selection so the warehouse filter/dropdown works (single or multiple warehouses).
          return deduped[0].id;
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
