/**
 * Pure computation for dashboard stats. Aligns with server/API: stock value = quantity × sellingPrice.
 * Supports quantityBySize for sized products. Used by tests; Dashboard/Inventory use API stats.
 */

export interface ProductForStats {
  quantity?: number;
  sellingPrice?: number;
  costPrice?: number;
  reorderLevel?: number;
  sizeKind?: string;
  quantityBySize?: Array<{ sizeCode?: string; quantity?: number }>;
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

function getProductQty(p: ProductForStats): number {
  if (p.sizeKind === 'sized' && p.quantityBySize?.length) {
    return (p.quantityBySize as Array<{ quantity?: number }>).reduce((s, r) => s + Number(r.quantity ?? 0), 0);
  }
  return Number(p.quantity ?? 0) || 0;
}

export function computeDashboardStats(
  products: ProductForStats[],
  todaySales: number,
  todayTransactions: number
): DashboardStatsResult {
  const reorder = (p: ProductForStats) => Number(p.reorderLevel ?? 0) || 0;
  const price = (p: ProductForStats) => Number(p.sellingPrice ?? 0) || 0;
  const totalProducts = products.length;
  const totalStockValue = products.reduce((sum, p) => sum + getProductQty(p) * price(p), 0);
  const lowStockItems = products.filter((p) => {
    const q = getProductQty(p);
    return q > 0 && q <= reorder(p);
  }).length;
  const outOfStockItems = products.filter((p) => getProductQty(p) === 0).length;

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
