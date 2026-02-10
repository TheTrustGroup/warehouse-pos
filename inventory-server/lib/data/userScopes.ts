/**
 * User scope mapping (Phase 3). Defines where a user (by email) may operate.
 * Absence of rows = unrestricted (legacy). Read for resolution; admin can list/set via API.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getStores } from '@/lib/data/stores';
import { getWarehouses, getWarehouseById } from '@/lib/data/warehouses';

const TABLE = 'user_scopes';

const getSupabase = (): SupabaseClient => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
};

export interface UserScopeRow {
  user_email: string;
  store_id: string | null;
  warehouse_id: string | null;
  pos_id: string | null;
}

export interface ResolvedScope {
  /** Non-empty = user restricted to these store ids. Empty = unrestricted. */
  allowedStoreIds: string[];
  /** Non-empty = user restricted to these warehouse ids. Empty = unrestricted. */
  allowedWarehouseIds: string[];
  /** Non-empty = user restricted to these pos_id values. Empty = unrestricted. */
  allowedPosIds: string[];
}

/** One scope entry with names (for admin UI). */
export interface UserScopeWithNames {
  storeId: string;
  storeName: string;
  warehouseId: string;
  warehouseName: string;
}

/**
 * Resolve scope for a user (by email). Returns distinct allowed store/warehouse/pos ids.
 * No rows or all nulls in a column → that dimension is unrestricted (legacy).
 */
export async function getScopeForUser(userEmail: string): Promise<ResolvedScope> {
  const supabase = getSupabase();
  const normalized = userEmail?.trim()?.toLowerCase() ?? '';
  if (!normalized) {
    return { allowedStoreIds: [], allowedWarehouseIds: [], allowedPosIds: [] };
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select('store_id, warehouse_id, pos_id')
    .eq('user_email', normalized);
  if (error) throw error;
  const rows = (data ?? []) as UserScopeRow[];
  const storeIds = new Set<string>();
  const warehouseIds = new Set<string>();
  const posIds = new Set<string>();
  for (const r of rows) {
    if (r.store_id) storeIds.add(r.store_id);
    if (r.warehouse_id) warehouseIds.add(r.warehouse_id);
    if (r.pos_id && String(r.pos_id).trim()) posIds.add(String(r.pos_id).trim());
  }
  return {
    allowedStoreIds: Array.from(storeIds),
    allowedWarehouseIds: Array.from(warehouseIds),
    allowedPosIds: Array.from(posIds),
  };
}

/**
 * List scope rows for an email with store/warehouse names. Admin-only (for UI).
 */
export async function listScopesForEmail(userEmail: string): Promise<UserScopeWithNames[]> {
  const normalized = userEmail?.trim()?.toLowerCase() ?? '';
  if (!normalized) return [];

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select('store_id, warehouse_id')
    .eq('user_email', normalized);
  if (error) throw error;
  const rows = (data ?? []) as { store_id: string | null; warehouse_id: string | null }[];

  const stores = await getStores();
  const warehouses = await getWarehouses();
  const storeMap = new Map(stores.map((s) => [s.id, s.name]));
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w.name]));

  const out: UserScopeWithNames[] = [];
  for (const r of rows) {
    if (!r.store_id || !r.warehouse_id) continue;
    const storeName = storeMap.get(r.store_id) ?? r.store_id;
    const warehouseName = warehouseMap.get(r.warehouse_id) ?? r.warehouse_id;
    out.push({
      storeId: r.store_id,
      storeName,
      warehouseId: r.warehouse_id,
      warehouseName,
    });
  }
  return out;
}

/**
 * Replace all scope rows for a user. Validates store/warehouse exist and warehouse belongs to store.
 * Admin-only. Empty scopes = clear (user becomes unrestricted for that dimension).
 */
export async function setScopesForUser(
  userEmail: string,
  scopes: Array<{ storeId: string; warehouseId: string }>
): Promise<void> {
  const normalized = userEmail?.trim()?.toLowerCase() ?? '';
  if (!normalized) throw new Error('User email is required.');

  const supabase = getSupabase();

  for (const s of scopes) {
    const wid = s.warehouseId?.trim();
    const sid = s.storeId?.trim();
    if (!wid || !sid) throw new Error('Each scope must have storeId and warehouseId.');
    const wh = await getWarehouseById(wid);
    if (!wh) throw new Error(`Warehouse ${wid} not found.`);
    if (wh.storeId !== sid) {
      throw new Error(`Warehouse ${wh.name} does not belong to the selected store.`);
    }
  }

  await supabase.from(TABLE).delete().eq('user_email', normalized);

  for (const s of scopes) {
    const { error } = await supabase.from(TABLE).insert({
      user_email: normalized,
      store_id: s.storeId.trim(),
      warehouse_id: s.warehouseId.trim(),
      pos_id: null,
    });
    if (error) throw error;
  }
}
