/**
 * React Query hooks for dashboard data.
 * Cache: staleTime 1 min, gcTime 5 min. Parallel fetch for dashboard + today-by-warehouse.
 */
import { useQueries } from '@tanstack/react-query';
import { getApiHeaders, API_BASE_URL } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

const FETCH_TIMEOUT_MS = 35_000;
const STALE_MS = 60 * 1000;   // 1 minute
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
  lowStockCount: number;
  outOfStockCount: number;
  todaySales: number;
  lowStockItems: DashboardLowStockItem[];
  categorySummary: DashboardCategorySummary;
}

async function fetchDashboard(warehouseId: string, date: string): Promise<DashboardData> {
  const path = `/api/dashboard?warehouse_id=${encodeURIComponent(warehouseId)}&date=${date}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: getApiHeaders() as HeadersInit,
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      const raw = await res.text();
      let msg = `HTTP ${res.status}`;
      try {
        const b = raw ? (JSON.parse(raw) as { error?: string; message?: string }) : {};
        msg = b.error ?? b.message ?? msg;
      } catch {
        if (raw && raw.length < 200) msg = raw;
      }
      throw new Error(msg);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as DashboardData;
  } catch (e: unknown) {
    clearTimeout(t);
    if (e instanceof Error && e.name === 'AbortError') throw new Error('Request timed out');
    throw e;
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
        queryFn: () => fetchDashboard(warehouseId, today),
        staleTime: STALE_MS,
        gcTime: GC_MS,
        enabled: Boolean(warehouseId?.trim()),
      },
      {
        queryKey: queryKeys.todayByWarehouse(today),
        queryFn: () => fetchTodayByWarehouse(today),
        staleTime: STALE_MS,
        gcTime: GC_MS,
        enabled: true,
      },
    ],
  });

  const isLoading = dashboardResult.isLoading || todayResult.isLoading;
  const error = dashboardResult.error ?? todayResult.error;
  const dashboard = dashboardResult.data ?? null;
  const todayByWarehouse = (todayResult.data ?? {}) as Record<string, number>;

  const refetch = () => {
    dashboardResult.refetch();
    todayResult.refetch();
  };

  return {
    dashboard,
    todayByWarehouse,
    isLoading,
    error: error instanceof Error ? error : null,
    refetch,
    isRefetching: dashboardResult.isRefetching || todayResult.isRefetching,
  };
}
