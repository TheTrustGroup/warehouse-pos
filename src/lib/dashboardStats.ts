/**
 * Pure computation for dashboard stats. Single source of truth for "stock values match recorded products."
 * Used by Dashboard.tsx; same formula as inventory list scope (current warehouse).
 */

export interface ProductForStats {
  quantity?: number;
  costPrice?: number;
  reorderLevel?: number;
}

export interface DashboardStatsResult {
  totalProducts: number;
  totalStockValue: number;
  lowStockItems: number;
  outOfStockItems: number;
  todaySales: number;
  todayTransactions: number;
  monthSales: number;
  topProducts: Array<{ id: string; name: string; sales: number; revenue: number }>;
}

export function computeDashboardStats(
  products: ProductForStats[],
  todaySales: number,
  todayTransactions: number
): DashboardStatsResult {
  const q = (p: ProductForStats) => Number(p.quantity ?? 0) || 0;
  const cost = (p: ProductForStats) => Number(p.costPrice ?? 0) || 0;
  const reorder = (p: ProductForStats) => Number(p.reorderLevel ?? 0) || 0;
  const totalProducts = products.length;
  const totalStockValue = products.reduce((sum, p) => sum + q(p) * cost(p), 0);
  const lowStockItems = products.filter((p) => q(p) > 0 && q(p) <= reorder(p)).length;
  const outOfStockItems = products.filter((p) => q(p) === 0).length;

  return {
    totalProducts,
    totalStockValue,
    lowStockItems,
    outOfStockItems,
    todaySales,
    todayTransactions,
    monthSales: 0,
    topProducts: [],
  };
}
