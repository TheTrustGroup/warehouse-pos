/**
 * Critical data load after login: parallel fetch of stores, warehouses, products, orders
 * with retry (max 3) and a global loading state that blocks UI until complete.
 *
 * All these requests go through apiClient (apiGet / apiRequest), which retries on timeout
 * and network errors, so "Error loading products" after login is avoided across every
 * route (Dashboard, Inventory, Orders, POS, etc.).
 */

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useStore } from './StoreContext';
import { useWarehouse } from './WarehouseContext';
import { useInventory } from './InventoryContext';
import { useOrders } from './OrderContext';
import { withRetry } from '../lib/retry';
import { getUserFriendlyMessage } from '../lib/errorMessages';
import { reportError } from '../lib/errorReporting';
import { apiRequest } from '../lib/apiClient';
import { API_BASE_URL } from '../lib/api';

const is401 = (e: unknown) => (e as { status?: number })?.status === 401;

interface CriticalDataContextType {
  /** True until the first parallel load after login has completed (success or failure). */
  isCriticalDataLoading: boolean;
  /** Error message if the initial load failed after all retries (we still allow UI to show). */
  criticalDataError: string | null;
  /** Manually trigger a full reload of critical data (e.g. after session refresh). */
  reloadCriticalData: () => Promise<void>;
}

const CriticalDataContext = createContext<CriticalDataContextType | undefined>(undefined);

/** Internal: setters for the gate. */
interface CriticalDataInternalType extends CriticalDataContextType {
  setCriticalDataLoading: (v: boolean) => void;
  setCriticalDataError: (v: string | null) => void;
  loadTrigger: number;
  triggerReload: () => void;
}

const CriticalDataInternalContext = createContext<CriticalDataInternalType | undefined>(undefined);

const MAX_RETRIES = 3;
/** Longer timeout for first load after login to absorb serverless cold start. */
const INITIAL_LOAD_TIMEOUT_MS = 35_000;

/** Lightweight health check to wake serverless before the main load. No auth; failures ignored. */
function apiWarmup(): Promise<void> {
  return apiRequest({
    baseUrl: API_BASE_URL,
    path: '/api/health',
    method: 'GET',
    timeoutMs: 10_000,
    maxRetries: 0,
    skipCircuit: true,
  })
    .then(() => {})
    .catch(() => {});
}

/**
 * Gate component: use inside CriticalDataProvider and inside Store/Warehouse/Inventory/Order providers.
 * When user is set, runs parallel fetch with retry; blocks UI with full-screen loading until done.
 */
export function CriticalDataGate({ children }: { children: ReactNode }) {
  const { user, tryRefreshSession } = useAuth();
  const { refreshStores } = useStore();
  const { refreshWarehouses } = useWarehouse();
  const { refreshProducts } = useInventory();
  const { refreshOrders } = useOrders();
  const internal = useContext(CriticalDataInternalContext);

  const initialOpts = { timeoutMs: INITIAL_LOAD_TIMEOUT_MS };

  const load = useCallback(async () => {
    if (!internal) return;
    internal.setCriticalDataLoading(true);
    internal.setCriticalDataError(null);
    try {
      // Phase 1: warmup + scope (stores, warehouses) so shell/selectors can rely on them
      await Promise.all([
        apiWarmup(),
        withRetry(() => refreshStores(initialOpts), MAX_RETRIES),
        withRetry(() => refreshWarehouses(initialOpts), MAX_RETRIES),
      ]);
      // Phase 2: inventory + orders (heavier; server more likely warm after phase 1)
      await Promise.all([
        withRetry(() => refreshProducts({ bypassCache: true, timeoutMs: INITIAL_LOAD_TIMEOUT_MS }), MAX_RETRIES),
        withRetry(() => refreshOrders(initialOpts), MAX_RETRIES),
      ]);
    } catch (err) {
      if (is401(err) && (await tryRefreshSession())) {
        try {
          await Promise.all([
            apiWarmup(),
            withRetry(() => refreshStores(initialOpts), MAX_RETRIES),
            withRetry(() => refreshWarehouses(initialOpts), MAX_RETRIES),
          ]);
          await Promise.all([
            withRetry(() => refreshProducts({ bypassCache: true, timeoutMs: INITIAL_LOAD_TIMEOUT_MS }), MAX_RETRIES),
            withRetry(() => refreshOrders(initialOpts), MAX_RETRIES),
          ]);
        } catch (retryErr) {
          const msg = getUserFriendlyMessage(retryErr);
          internal.setCriticalDataError(msg);
          reportError(retryErr, { context: 'CriticalDataContext.retry' });
        }
      } else {
        const msg = getUserFriendlyMessage(err);
        internal.setCriticalDataError(msg);
        reportError(err, { context: 'CriticalDataContext.load' });
      }
    } finally {
      internal.setCriticalDataLoading(false);
    }
  }, [internal, tryRefreshSession, refreshStores, refreshWarehouses, refreshProducts, refreshOrders]);

  useEffect(() => {
    if (!user || !internal) return;
    load();
  }, [user?.id, internal?.loadTrigger]); // eslint-disable-line react-hooks/exhaustive-deps -- run when user set or reload triggered

  if (!user) return <>{children}</>;
  if (!internal) return <>{children}</>;

  if (internal.isCriticalDataLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50 p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4" />
        <p className="text-slate-600 font-medium">Loading your data...</p>
        <p className="text-slate-500 text-sm mt-1">Stores, warehouses, inventory, orders</p>
      </div>
    );
  }

  return <>{children}</>;
}

export function useCriticalData() {
  const ctx = useContext(CriticalDataContext);
  if (!ctx) throw new Error('useCriticalData must be used within CriticalDataProvider');
  return ctx;
}

export function CriticalDataProvider({ children }: { children: ReactNode }) {
  const [isCriticalDataLoading, setCriticalDataLoading] = useState(false);
  const [criticalDataError, setCriticalDataError] = useState<string | null>(null);
  const [loadTrigger, setLoadTrigger] = useState(0);

  const triggerReload = useCallback(() => {
    setCriticalDataLoading(true);
    setCriticalDataError(null);
    setLoadTrigger((n) => n + 1);
  }, []);

  const reloadCriticalData = useCallback(async () => {
    triggerReload();
  }, [triggerReload]);

  const value: CriticalDataContextType = {
    isCriticalDataLoading,
    criticalDataError,
    reloadCriticalData,
  };

  const internalValue: CriticalDataInternalType = {
    ...value,
    setCriticalDataLoading,
    setCriticalDataError,
    loadTrigger,
    triggerReload,
  };

  return (
    <CriticalDataInternalContext.Provider value={internalValue}>
      <CriticalDataContext.Provider value={value}>
        {children}
      </CriticalDataContext.Provider>
    </CriticalDataInternalContext.Provider>
  );
}
