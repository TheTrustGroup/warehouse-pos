/**
 * Read-only access to stock_movements (audit trail). No mutations.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const getSupabase = (): SupabaseClient => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
};

export interface StockMovementRow {
  id: string;
  transaction_id: string | null;
  warehouse_id: string;
  product_id: string;
  quantity_delta: number;
  reference_type: string;
  created_at: string;
}

export interface ListStockMovementsFilters {
  warehouse_id?: string;
  transaction_id?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

/**
 * List stock movements (read-only). Uses indexed columns.
 */
export async function listStockMovements(filters: ListStockMovementsFilters): Promise<{
  data: StockMovementRow[];
  total: number;
}> {
  const supabase = getSupabase();
  const limit = Math.min(Math.max(1, filters.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const offset = Math.max(0, filters.offset ?? 0);

  let query = supabase
    .from('stock_movements')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.warehouse_id?.trim()) {
    query = query.eq('warehouse_id', filters.warehouse_id.trim());
  }
  if (filters.transaction_id?.trim()) {
    query = query.eq('transaction_id', filters.transaction_id.trim());
  }
  if (filters.from?.trim()) {
    query = query.gte('created_at', filters.from.trim());
  }
  if (filters.to?.trim()) {
    query = query.lte('created_at', filters.to.trim());
  }

  const { data: rows, error, count } = await query;
  if (error) throw error;

  return { data: (rows ?? []) as StockMovementRow[], total: count ?? 0 };
}
