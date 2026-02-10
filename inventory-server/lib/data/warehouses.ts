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
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
}

function rowToApi(row: WarehouseRow): Warehouse {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** GET all warehouses. */
export async function getWarehouses(): Promise<Warehouse[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from(TABLE).select('*').order('name');
  if (error) throw error;
  return ((data ?? []) as WarehouseRow[]).map(rowToApi);
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
