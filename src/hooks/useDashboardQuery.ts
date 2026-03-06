/**
 * React Query hooks for dashboard data.
 * Dashboard query: staleTime 0 so Stock Alerts refetch when Dashboard is shown/focused.
 * Uses dashboardApi (dedupe + exponential backoff + dashboard-only circuit) so dashboard
 * failures do not open the global circuit or disable sales/POS.
 */
import { useQueries } from '@tanstack/react-query';
import { API_BASE_URL } from '../lib/api';
import { dashboardGet } from '../lib/dashboardApi';
import { queryKeys } from '../lib/queryKeys';
import { isValidWarehouseId } from '../lib/warehouseId';

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
  /** Set when API returns 200 with empty stats (e.g. backend error). */
  error?: string;
}

async function fetchDashboard(
  warehouseId: string,
  date: string,
  signal?: AbortSignal | null
): Promise<DashboardData> {
  const path = `/api/dashboard?warehouse_id=${encodeURIComponent(warehouseId)}&date=${date}`;
  try {
    const data = await dashboardGet<DashboardData>(API_BASE_URL, path, { signal });
    if (data == null || typeof data !== 'object') {
      throw new Error('Invalid dashboard response');
    }
    return data;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load dashboard';
    throw new Error(message);
  }
}

async function fetchTodayByWarehouse(date: string, signal?: AbortSignal | null): Promise<Record<string, number>> {
  const path = `/api/dashboard/today-by-warehouse?date=${date}`;
  try {
    const data = await dashboardGet<Record<string, number>>(API_BASE_URL, path, { signal });
    return data != null && typeof data === 'object' ? data : {};
  } catch {
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
        enabled: isValidWarehouseId(warehouseId),
      },
      {
        queryKey: queryKeys.todayByWarehouse(today),
        queryFn: ({ signal }) => fetchTodayByWarehouse(today, signal),
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
