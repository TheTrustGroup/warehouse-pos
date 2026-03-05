/**
 * React Query hooks for dashboard data.
 * Dashboard query: staleTime 0 so Stock Alerts refetch when Dashboard is shown/focused.
 * Server always returns fresh lowStockItems (merged on cache hit); client refetch ensures UI updates.
 * Uses apiGet so dashboard GET gets retries, timeout, and circuit breaker (fewer "Failed to load data" from transient 503).
 */
import { useQueries } from '@tanstack/react-query';
import { getApiHeaders, API_BASE_URL } from '../lib/api';
import { apiGet } from '../lib/apiClient';
import { queryKeys } from '../lib/queryKeys';

const FETCH_TIMEOUT_MS = 35_000;
const STALE_MS_DASHBOARD = 0;        // Always refetch when Dashboard is used (alerts must be current)
const STALE_MS_TODAY_BY_WAREHOUSE = 60 * 1000;
const GC_MS = 5 * 60 * 1000;  // 5 minutes

export interface DashboardLowStockItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  quantityBySize: { sizeCode: string; quantity: number }[];
  reorderLevel: number;
}

export interface DashboardCategorySummary {
  [category: string]: { count: number; value: number };
}

export interface DashboardData {
  totalStockValue: number;
  totalProducts: number;
  totalUnits: number;
  lowStockCount: number;
  outOfStockCount: number;
  todaySales: number;
  lowStockItems: DashboardLowStockItem[];
  categorySummary: DashboardCategorySummary;
}

async function fetchDashboard(
  warehouseId: string,
  date: string,
  signal?: AbortSignal | null
): Promise<DashboardData> {
  const path = `/api/dashboard?warehouse_id=${encodeURIComponent(warehouseId)}&date=${date}`;
  try {
    const data = await apiGet<DashboardData>(API_BASE_URL, path, {
      timeoutMs: FETCH_TIMEOUT_MS,
      signal,
    });
    if (data == null || typeof data !== 'object') {
      throw new Error('Invalid dashboard response');
    }
    return data;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load dashboard';
    throw new Error(message);
  }
}

async function fetchTodayByWarehouse(date: string): Promise<Record<string, number>> {
  const path = `/api/dashboard/today-by-warehouse?date=${date}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: getApiHeaders() as HeadersInit,
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return {};
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    return typeof data === 'object' && data !== null ? data : {};
  } catch {
    clearTimeout(t);
    return {};
  }
}

export function useDashboardQuery(warehouseId: string) {
  const today = new Date().toISOString().split('T')[0];
  const [dashboardResult, todayResult] = useQueries({
    queries: [
      {
        queryKey: queryKeys.dashboard(warehouseId, today),
        queryFn: ({ signal }) => fetchDashboard(warehouseId, today, signal),
        staleTime: STALE_MS_DASHBOARD,
        gcTime: GC_MS,
        refetchOnWindowFocus: true,
        enabled: Boolean(warehouseId?.trim()),
      },
      {
        queryKey: queryKeys.todayByWarehouse(today),
        queryFn: () => fetchTodayByWarehouse(today),
        staleTime: STALE_MS_TODAY_BY_WAREHOUSE,
        gcTime: GC_MS,
        enabled: true,
      },
    ],
  });

  const isLoading = dashboardResult.isLoading || todayResult.isLoading;
  const dashboard = dashboardResult.data ?? null;
  const todayByWarehouse = (todayResult.data ?? {}) as Record<string, number>;

  const rawError = dashboardResult.error ?? todayResult.error;
  const normalizedError =
    rawError == null
      ? null
      : rawError instanceof Error
        ? rawError
        : new Error(String(rawError));

  const refetch = () => {
    dashboardResult.refetch();
    todayResult.refetch();
  };

  return {
    dashboard: dashboard ?? null,
    todayByWarehouse,
    isLoading,
    error: normalizedError,
    refetch,
    isRefetching: dashboardResult.isRefetching || todayResult.isRefetching,
  };
}
