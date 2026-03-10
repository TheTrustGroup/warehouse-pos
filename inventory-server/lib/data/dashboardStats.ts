/**
 * Dashboard stats: one server-side aggregation so the client gets a small payload
 * instead of loading all products. Used by GET /api/dashboard.
 * Cached for 30s (today only) via Upstash Redis when configured; invalidate on inventory change.
 */

import { getWarehouseProducts, type ProductRecord } from '@/lib/data/warehouseProducts';
import { getSupabase } from '@/lib/supabase';
import { getCached, setCached } from '@/lib/cache/dashboardStatsCache';

const LOW_STOCK_ALERTS_LIMIT = 10;
/** When we have view stats we only need products for lowStockItems + categorySummary; smaller fetch finishes under timeout. */
const DASHBOARD_PRODUCTS_LIMIT = 100;

/** Derive quantity from actual data: sum of quantityBySize when present, else quantity. */
function getProductQty(p: ProductRecord): number {
  const qtyBySize = Array.isArray(p.quantityBySize) ? p.quantityBySize : [];
  if (qtyBySize.length > 0) {
    return qtyBySize.reduce((s, r) => s + (r.quantity ?? 0), 0);
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
 * Fetch warehouse-level stats from warehouse_dashboard_stats view (one query, instant).
 * Returns null if view is unavailable (e.g. migration not applied).
 */
async function getWarehouseStatsFromView(warehouseId: string): Promise<WarehouseStatsRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('warehouse_dashboard_stats')
    .select('total_stock_value, total_products, total_units, low_stock_count, out_of_stock_count')
    .eq('warehouse_id', warehouseId)
    .maybeSingle();
  if (error) {
    console.warn('[dashboardStats] warehouse_dashboard_stats view failed, trying RPC:', error.message);
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  return {
    total_stock_value: Number(row.total_stock_value ?? 0),
    total_products: Number(row.total_products ?? 0),
    total_units: Number(row.total_units ?? 0),
    low_stock_count: Number(row.low_stock_count ?? 0),
    out_of_stock_count: Number(row.out_of_stock_count ?? 0),
  };
}

/**
 * Fetch accurate warehouse-level stats from DB (all products, no limit).
 * Prefers warehouse_dashboard_stats view; falls back to RPC then product sample.
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
  // Prefer SQL aggregation (fast + low bandwidth). Fallback is row-scan (can be slow on big tables).
  const { data: agg, error: aggError } = await supabase.rpc('get_today_sales_by_warehouse', {
    p_date: date,
  });

  if (!aggError && Array.isArray(agg)) {
    const out: Record<string, number> = {};
    for (const row of agg as Array<{ warehouse_id?: string; revenue?: number | string }>) {
      const wid = row.warehouse_id ?? '';
      const revenue = Number(row.revenue ?? 0);
      if (wid) out[wid] = revenue;
    }
    return out;
  }

  if (aggError) {
    console.warn('[dashboardStats] get_today_sales_by_warehouse RPC failed, falling back:', aggError.message);
  }

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

function isToday(date: string): boolean {
  return date === new Date().toISOString().split('T')[0];
}

function isDashboardStatsResult(v: unknown): v is DashboardStatsResult {
  if (v == null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.totalStockValue === 'number' &&
    typeof o.totalProducts === 'number' &&
    typeof o.totalUnits === 'number' &&
    typeof o.lowStockCount === 'number' &&
    typeof o.outOfStockCount === 'number' &&
    typeof o.todaySales === 'number' &&
    Array.isArray(o.lowStockItems) &&
    typeof o.categorySummary === 'object'
  );
}

/**
 * Compute only the low-stock alerts list from a fresh product fetch.
 * Used when serving from cache so Stock Alerts always reflect current inventory (data integrity).
 */
async function computeLowStockItemsFresh(
  warehouseId: string,
  signal?: AbortSignal | null
): Promise<DashboardLowStockItem[]> {
  const productsResult = await getWarehouseProducts(warehouseId, {
    limit: DASHBOARD_PRODUCTS_LIMIT,
    signal: signal ?? undefined,
  });
  const products = productsResult.data;
  const lowStockCandidates: ProductRecord[] = [];
  for (const p of products) {
    const qty = getProductQty(p);
    const reorder = p.reorderLevel ?? 0;
    if (qty <= reorder) lowStockCandidates.push(p);
  }
  return lowStockCandidates
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
}

/**
 * Compute dashboard stats from DB (no cache). Used on cache miss or when date !== today.
 */
async function computeDashboardStatsUncached(
  warehouseId: string,
  date: string,
  signal?: AbortSignal | null
): Promise<DashboardStatsResult> {
  const [viewStats, productsResult, todaySales] = await Promise.all([
    getWarehouseStatsFromView(warehouseId),
    getWarehouseProducts(warehouseId, { limit: DASHBOARD_PRODUCTS_LIMIT, signal: signal ?? undefined }),
    getTodaySalesTotal(warehouseId, date),
  ]);
  const products = productsResult.data;

  let totalStockValue: number;
  let totalProducts: number;
  let totalUnits: number;
  let lowStockCount: number;
  let outOfStockCount: number;

  if (viewStats) {
    totalStockValue = viewStats.total_stock_value;
    totalProducts = viewStats.total_products;
    totalUnits = viewStats.total_units;
    lowStockCount = viewStats.low_stock_count;
    outOfStockCount = viewStats.out_of_stock_count;
  } else {
    const rpcStats = await getWarehouseStatsFromRpc(warehouseId);
    if (rpcStats) {
      totalStockValue = rpcStats.total_stock_value;
      totalProducts = rpcStats.total_products;
      totalUnits = rpcStats.total_units;
      lowStockCount = rpcStats.low_stock_count;
      outOfStockCount = rpcStats.out_of_stock_count;
    } else {
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

/**
 * Compute dashboard stats for a warehouse. Cached 30s for today only when Redis is configured.
 * Stock Alerts (lowStockItems) are always computed fresh so they reflect current inventory
 * even when serving from cache — avoids stale alerts after product edits.
 */
export async function getDashboardStats(
  warehouseId: string,
  options: { date?: string; signal?: AbortSignal | null } = {}
): Promise<DashboardStatsResult> {
  const date = options.date ?? new Date().toISOString().split('T')[0];
  const signal = options.signal ?? null;
  const useCache = isToday(date);

  if (useCache) {
    let cached: unknown = null;
    try {
      cached = await getCached(warehouseId);
    } catch (e) {
      console.warn('[dashboardStats] Cache unavailable, using DB:', e instanceof Error ? e.message : e);
    }
    if (isDashboardStatsResult(cached)) {
      const lowStockItems = await computeLowStockItemsFresh(warehouseId, signal);
      return { ...cached, lowStockItems };
    }
  }

  const result = await computeDashboardStatsUncached(warehouseId, date, signal);
  if (useCache) {
    try {
      await setCached(warehouseId, result);
    } catch (e) {
      console.warn('[dashboardStats] Cache set failed:', e instanceof Error ? e.message : e);
    }
  }
  return result;
}
