/**
 * First-class Warehouse entity. Used to scope inventory and POS.
 * Table: warehouses (Supabase). API: GET /api/warehouses.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const TABLE = 'warehouses';

/** Default warehouse id inserted by migration (Main Store). */
export const DEFAULT_WAREHOUSE_ID = '00000000-0000-0000-0000-000000000001';

const getSupabase = (): SupabaseClient => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
};

export interface WarehouseRow {
  id: string;
  name: string;
  code: string;
  created_at: string;
  updated_at: string;
  store_id?: string | null;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
  /** Optional (Phase 3). Warehouse belongs to this store when set. */
  storeId?: string | null;
}

function rowToApi(row: WarehouseRow): Warehouse {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    storeId: row.store_id ?? undefined,
  };
}

/** GET warehouses. Optional filter by store_id; optional allowedWarehouseIds (scope). Deduplicated by code so the UI never shows duplicate warehouses (e.g. two "Main town" from different seeds). */
export async function getWarehouses(options?: { storeId?: string; allowedWarehouseIds?: string[] | null }): Promise<Warehouse[]> {
  const supabase = getSupabase();
  let query = supabase.from(TABLE).select('*').order('name');
  if (options?.storeId?.trim()) {
    query = query.eq('store_id', options.storeId.trim());
  }
  if (options?.allowedWarehouseIds != null && options.allowedWarehouseIds.length > 0) {
    query = query.in('id', options.allowedWarehouseIds);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as WarehouseRow[];
  const byKey = new Map<string, Warehouse>();
  for (const row of rows) {
    const code = (row.code ?? '').trim().toUpperCase();
    const nameNorm = (row.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const key = code || nameNorm || row.id;
    if (!byKey.has(key)) {
      byKey.set(key, rowToApi(row));
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** GET one warehouse by id. */
export async function getWarehouseById(id: string): Promise<Warehouse | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToApi(data as WarehouseRow) : null;
}

/** Return default warehouse id (for backward compatibility when client does not send warehouse_id). */
export function getDefaultWarehouseId(): string {
  return DEFAULT_WAREHOUSE_ID;
}
