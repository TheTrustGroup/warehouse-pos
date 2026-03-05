/**
 * Reports API — sales metrics from GET /api/reports/sales (SQL aggregation from sales + sale_lines).
 * Single source of truth for revenue, COGS, profit; cost at time of sale.
 */

import { getApiHeaders } from '../lib/api';

export interface SalesReportApiResponse {
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  transactionCount: number;
  unitsSold: number;
  averageOrderValue: number;
  topProducts: Array<{
    productId?: string;
    productName?: string;
    unitsSold?: number;
    revenue?: number;
    cogs?: number;
    profit?: number;
    marginPct?: number;
  }>;
  salesByDay: Array<{
    date: string;
    revenue: number;
    transactions: number;
  }>;
}

export interface FetchSalesReportParams {
  warehouseId: string;
  from?: string;
  to?: string;
  period?: 'today' | 'week' | 'month' | 'last_month' | 'quarter' | 'year';
}

/**
 * Fetch sales report from GET /api/reports/sales. All metrics computed in SQL.
 * Returns null on non-2xx or when get_sales_report RPC is not available.
 */
export async function fetchSalesReport(
  baseUrl: string,
  params: FetchSalesReportParams
): Promise<SalesReportApiResponse | null> {
  const search = new URLSearchParams();
  search.set('warehouse_id', params.warehouseId);
  if (params.period) search.set('period', params.period);
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  const url = `${baseUrl.replace(/\/$/, '')}/api/reports/sales?${search.toString()}`;
  try {
    const res = await fetch(url, { headers: getApiHeaders(), credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as SalesReportApiResponse;
    if (data == null || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}
