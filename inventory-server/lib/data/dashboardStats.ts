/**
 * Dashboard stats: one server-side aggregation so the client gets a small payload
 * instead of loading all products. Used by GET /api/dashboard.
 */

import { getWarehouseProducts, type ProductRecord } from '@/lib/data/warehouseProducts';
import { getSupabase } from '@/lib/supabase';

const LOW_STOCK_ALERTS_LIMIT = 10;
/** Cap aligned with getWarehouseProducts (250) to avoid timeouts; stats are over this sample. */
const PRODUCTS_LIMIT = 250;

function getProductQty(p: ProductRecord): number {
  if (p.sizeKind === 'sized' && p.quantityBySize?.length > 0) {
    return p.quantityBySize.reduce((s, r) => s + (r.quantity ?? 0), 0);
  }
  return p.quantity ?? 0;
}

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

export interface DashboardStatsResult {
  totalStockValue: number;
  totalProducts: number;
  totalUnits: number;
  lowStockCount: number;
  outOfStockCount: number;
  todaySales: number;
  lowStockItems: DashboardLowStockItem[];
  categorySummary: DashboardCategorySummary;
}

/** Row returned by get_warehouse_inventory_stats RPC. */
interface WarehouseStatsRow {
  total_stock_value: number;
  total_products: number;
  total_units: number;
  low_stock_count: number;
  out_of_stock_count: number;
}

/**
 * Fetch accurate warehouse-level stats from DB (all products, no limit).
 * Returns null if RPC is unavailable (e.g. migration not applied).
 */
async function getWarehouseStatsFromRpc(warehouseId: string): Promise<WarehouseStatsRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('get_warehouse_inventory_stats', {
    p_warehouse_id: warehouseId,
  });
  if (error) {
    console.warn('[dashboardStats] get_warehouse_inventory_stats RPC failed, using product sample:', error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  return {
    total_stock_value: Number((row as Record<string, unknown>).total_stock_value ?? 0),
    total_products: Number((row as Record<string, unknown>).total_products ?? 0),
    total_units: Number((row as Record<string, unknown>).total_units ?? 0),
    low_stock_count: Number((row as Record<string, unknown>).low_stock_count ?? 0),
    out_of_stock_count: Number((row as Record<string, unknown>).out_of_stock_count ?? 0),
  };
}

/**
 * Fetch today's sales total for a warehouse (sum of sale totals for the given date).
 */
async function getTodaySalesTotal(warehouseId: string, date: string): Promise<number> {
  const supabase = getSupabase();
  const start = `${date}T00:00:00.000Z`;
  const end = `${date}T23:59:59.999Z`;
  const { data, error } = await supabase
    .from('sales')
    .select('total')
    .eq('warehouse_id', warehouseId)
    .gte('created_at', start)
    .lt('created_at', end);
  if (error) {
    console.error('[dashboardStats] getTodaySalesTotal', error);
    return 0;
  }
  const total = (data ?? []).reduce((sum, row) => sum + Number((row as { total?: number }).total ?? 0), 0);
  return total;
}

/**
 * Fetch today's sales total per warehouse for a given date.
 * Returns { [warehouseId]: number } for Admin Control Panel "Today's sales by location".
 */
export async function getTodaySalesByWarehouse(date: string): Promise<Record<string, number>> {
  const supabase = getSupabase();
  const start = `${date}T00:00:00.000Z`;
  const end = `${date}T23:59:59.999Z`;
  const { data, error } = await supabase
    .from('sales')
    .select('warehouse_id, total')
    .gte('created_at', start)
    .lt('created_at', end);
  if (error) {
    console.error('[dashboardStats] getTodaySalesByWarehouse', error);
    return {};
  }
  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    const wid = (row as { warehouse_id?: string }).warehouse_id ?? '';
    const t = Number((row as { total?: number }).total ?? 0);
    if (wid) out[wid] = (out[wid] ?? 0) + t;
  }
  return out;
}

/**
 * Compute dashboard stats for a warehouse.
 * Totals (stock value, product count, units, low/out counts) come from DB RPC over all products.
 * Low-stock list and category summary use a capped product fetch (250) for response size.
 */
export async function getDashboardStats(
  warehouseId: string,
  options: { date?: string } = {}
): Promise<DashboardStatsResult> {
  const date = options.date ?? new Date().toISOString().split('T')[0];
  const [rpcStats, productsResult, todaySales] = await Promise.all([
    getWarehouseStatsFromRpc(warehouseId),
    getWarehouseProducts(warehouseId, { limit: PRODUCTS_LIMIT }),
    getTodaySalesTotal(warehouseId, date),
  ]);
  const products = productsResult.data;

  let totalStockValue: number;
  let totalProducts: number;
  let totalUnits: number;
  let lowStockCount: number;
  let outOfStockCount: number;

  if (rpcStats) {
    totalStockValue = rpcStats.total_stock_value;
    totalProducts = rpcStats.total_products;
    totalUnits = rpcStats.total_units;
    lowStockCount = rpcStats.low_stock_count;
    outOfStockCount = rpcStats.out_of_stock_count;
  } else {
    // Fallback when RPC not available: compute from product sample (first PRODUCTS_LIMIT)
    let value = 0;
    let low = 0;
    let out = 0;
    let units = 0;
    for (const p of products) {
      const qty = getProductQty(p);
      const reorder = p.reorderLevel ?? 0;
      const price = p.sellingPrice ?? 0;
      units += qty;
      value += qty * price;
      if (qty === 0) out++;
      else if (qty <= reorder) low++;
    }
    totalStockValue = value;
    totalProducts = products.length;
    totalUnits = units;
    lowStockCount = low;
    outOfStockCount = out;
  }

  const categorySummary: DashboardCategorySummary = {};
  const lowStockCandidates: ProductRecord[] = [];
  for (const p of products) {
    const qty = getProductQty(p);
    const reorder = p.reorderLevel ?? 0;
    const price = p.sellingPrice ?? 0;
    if (qty <= reorder) lowStockCandidates.push(p);
    const cat = p.category?.trim() || 'Uncategorised';
    if (!categorySummary[cat]) categorySummary[cat] = { count: 0, value: 0 };
    categorySummary[cat].count++;
    categorySummary[cat].value += qty * price;
  }

  const lowStockItems: DashboardLowStockItem[] = lowStockCandidates
    .sort((a, b) => getProductQty(a) - getProductQty(b))
    .slice(0, LOW_STOCK_ALERTS_LIMIT)
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category?.trim() || 'Uncategorised',
      quantity: getProductQty(p),
      quantityBySize: (p.quantityBySize ?? []).map((s) => ({ sizeCode: s.sizeCode, quantity: s.quantity })),
      reorderLevel: p.reorderLevel ?? 0,
    }));

  return {
    totalStockValue,
    totalProducts,
    totalUnits,
    lowStockCount,
    outOfStockCount,
    todaySales,
    lowStockItems,
    categorySummary,
  };
}
