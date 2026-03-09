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
import { resetAllApiCircuitBreakers } from '../lib/circuit';
import { LoadingScreen } from '../components/ui/LoadingSpinner';

const is401 = (e: unknown) => (e as { status?: number })?.status === 401;

interface CriticalDataContextType {
  /** True until the first parallel load after login has completed (success or failure). */
  isCriticalDataLoading: boolean;
  /** True while phase 2 (inventory, orders) is syncing in the background after app is shown. */
  isSyncingCriticalData: boolean;
  /** Error message if the initial load failed after all retries (we still allow UI to show). */
  criticalDataError: string | null;
  /** Manually trigger a full reload of critical data (e.g. after session refresh). */
  reloadCriticalData: () => Promise<void>;
}

const CriticalDataContext = createContext<CriticalDataContextType | undefined>(undefined);

/** Internal: setters for the gate. */
interface CriticalDataInternalType extends CriticalDataContextType {
  setCriticalDataLoading: (v: boolean) => void;
  setSyncingCriticalData: (v: boolean) => void;
  setCriticalDataError: (v: string | null) => void;
  setPhase1Failed: (v: boolean) => void;
  loadTrigger: number;
  triggerReload: () => void;
  phase1Failed: boolean;
}

const CriticalDataInternalContext = createContext<CriticalDataInternalType | undefined>(undefined);

const MAX_RETRIES = 3;
/** Phase 1 (stores + warehouses): 12s max — small tables, fail fast so user sees error + retry. */
const PHASE1_TIMEOUT_MS = 12_000;
/** Phase 2 (products, orders): longer timeout for heavier fetches. */
const INITIAL_LOAD_TIMEOUT_MS = 90_000;

/** Phase 1 loading screen with elapsed-time message (after 3s / 8s). */
function Phase1LoadingScreen() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      className="min-h-[var(--min-h-viewport)] flex flex-col items-center justify-center bg-[var(--edk-bg)] gap-4"
      role="status"
      aria-live="polite"
    >
      <LoadingScreen message="Loading warehouse..." />
      {elapsed >= 3 && (
        <p
          className="m-0"
          style={{
            fontSize: 12,
            color: 'var(--edk-ink-3)',
            marginTop: 8,
          }}
        >
          {elapsed < 8 ? 'Connecting to server…' : 'Taking longer than usual. Please wait…'}
        </p>
      )}
    </div>
  );
}

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

  const phase1Opts = { timeoutMs: PHASE1_TIMEOUT_MS };
  const phase2Opts = { timeoutMs: INITIAL_LOAD_TIMEOUT_MS };

  const load = useCallback(async () => {
    if (!internal) return;
    internal.setCriticalDataLoading(true);
    internal.setCriticalDataError(null);
    internal.setPhase1Failed(false);
    try {
      // Phase 1: scope (stores, warehouses). Warmup runs in parallel but does not block (reduces cold-start wait).
      apiWarmup();
      await Promise.all([
        withRetry(() => refreshStores(phase1Opts), MAX_RETRIES),
        withRetry(() => refreshWarehouses(phase1Opts), MAX_RETRIES),
      ]);
      // Show app immediately; phase 2 (inventory, orders) runs in background so products appear from cache then refresh
      internal.setCriticalDataLoading(false);
      internal.setSyncingCriticalData(true);
      // Phase 2: inventory + orders (heavier) — silent so we don't replace cache with "Loading products..." spinner
      Promise.all([
        withRetry(() => refreshProducts({ bypassCache: true, timeoutMs: INITIAL_LOAD_TIMEOUT_MS, silent: true }), MAX_RETRIES),
        withRetry(() => refreshOrders(phase2Opts), MAX_RETRIES),
      ])
        .catch((err) => {
          const msg = getUserFriendlyMessage(err);
          internal.setCriticalDataError(msg);
          reportError(err, { context: 'CriticalDataContext.phase2' });
        })
        .finally(() => internal.setSyncingCriticalData(false));
    } catch (err) {
      if (is401(err) && (await tryRefreshSession())) {
        try {
          apiWarmup();
          await Promise.all([
            withRetry(() => refreshStores(phase1Opts), MAX_RETRIES),
            withRetry(() => refreshWarehouses(phase1Opts), MAX_RETRIES),
          ]);
          internal.setCriticalDataLoading(false);
          internal.setSyncingCriticalData(true);
          Promise.all([
            withRetry(() => refreshProducts({ bypassCache: true, timeoutMs: INITIAL_LOAD_TIMEOUT_MS, silent: true }), MAX_RETRIES),
            withRetry(() => refreshOrders(phase2Opts), MAX_RETRIES),
          ])
            .catch((retryErr) => {
              const msg = getUserFriendlyMessage(retryErr);
              internal.setCriticalDataError(msg);
              reportError(retryErr, { context: 'CriticalDataContext.phase2-retry' });
            })
            .finally(() => internal.setSyncingCriticalData(false));
        } catch (retryErr) {
          const msg = getUserFriendlyMessage(retryErr);
          internal.setCriticalDataError(msg);
          internal.setPhase1Failed(true);
          internal.setCriticalDataLoading(false);
          reportError(retryErr, { context: 'CriticalDataContext.retry' });
        }
      } else {
        const msg = getUserFriendlyMessage(err);
        internal.setCriticalDataError(msg);
        internal.setPhase1Failed(true);
        internal.setCriticalDataLoading(false);
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

  if (internal.phase1Failed && internal.criticalDataError) {
    return (
      <div
        className="min-h-[var(--min-h-viewport)] flex flex-col items-center justify-center bg-[var(--edk-bg)]"
        role="alert"
      >
        <p
          className="text-center m-0"
          style={{
            fontSize: 13,
            color: 'var(--edk-red)',
            marginBottom: 12,
          }}
        >
          Could not connect to server.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 20px',
            background: 'var(--edk-red)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--edk-radius)',
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (internal.isCriticalDataLoading) {
    return <Phase1LoadingScreen />;
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
  const [isSyncingCriticalData, setSyncingCriticalData] = useState(false);
  const [criticalDataError, setCriticalDataError] = useState<string | null>(null);
  const [phase1Failed, setPhase1Failed] = useState(false);
  const [loadTrigger, setLoadTrigger] = useState(0);

  const triggerReload = useCallback(() => {
    setCriticalDataLoading(true);
    setSyncingCriticalData(false);
    setCriticalDataError(null);
    setPhase1Failed(false);
    setLoadTrigger((n) => n + 1);
  }, []);

  const reloadCriticalData = useCallback(async () => {
    resetAllApiCircuitBreakers();
    triggerReload();
  }, [triggerReload]);

  const value: CriticalDataContextType = {
    isCriticalDataLoading,
    isSyncingCriticalData,
    criticalDataError,
    reloadCriticalData,
  };

  const internalValue: CriticalDataInternalType = {
    ...value,
    setCriticalDataLoading,
    setSyncingCriticalData,
    setCriticalDataError,
    setPhase1Failed,
    loadTrigger,
    triggerReload,
    phase1Failed,
  };

  return (
    <CriticalDataInternalContext.Provider value={internalValue}>
      <CriticalDataContext.Provider value={value}>
        {children}
      </CriticalDataContext.Provider>
    </CriticalDataInternalContext.Provider>
  );
}
