/**
 * User scopes: warehouse/store access from user_scopes table.
 * Table: user_scopes(user_email, store_id, warehouse_id, created_at).
 */

import { getSupabase } from '@/lib/supabase';

export interface UserScope {
  storeId: string;
  warehouseId: string;
  storeName?: string;
  warehouseName?: string;
  warehouseCode?: string;
}

export interface AssignedPos {
  storeId: string;
  warehouseId: string;
  storeName: string;
  warehouseName: string;
  warehouseCode: string;
}

export interface UserScopeResult {
  allowedWarehouseIds: string[];
  allowedStoreIds: string[];
  allowedPosIds: string[];
}

/** Allowed warehouse/store IDs for a user (for authz). allowedPosIds from schema if present; empty here. */
export async function getScopeForUser(email: string): Promise<UserScopeResult> {
  const normalized = email?.trim()?.toLowerCase();
  if (!normalized) return { allowedWarehouseIds: [], allowedStoreIds: [], allowedPosIds: [] };

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('user_scopes')
    .select('warehouse_id, store_id')
    .eq('user_email', normalized);

  if (error) {
    console.error('[userScopes] getScopeForUser', error.message);
    return { allowedWarehouseIds: [], allowedStoreIds: [], allowedPosIds: [] };
  }

  const rows = (data ?? []) as Array<{ warehouse_id?: string; store_id?: string }>;
  const warehouseIds = [...new Set(rows.map((r) => r.warehouse_id).filter((id): id is string => typeof id === 'string' && id.length > 0))];
  const storeIds = [...new Set(rows.map((r) => r.store_id).filter((id): id is string => typeof id === 'string' && id.length > 0))];
  return {
    allowedWarehouseIds: warehouseIds,
    allowedStoreIds: storeIds,
    allowedPosIds: [],
  };
}

/** First scope as "assigned POS" for the user (store + warehouse details). Used by POS UI. */
export async function getAssignedPosForUser(email: string): Promise<AssignedPos | null> {
  const normalized = email?.trim()?.toLowerCase();
  if (!normalized) return null;

  const supabase = getSupabase();
  const { data: scopeRow, error: scopeErr } = await supabase
    .from('user_scopes')
    .select('store_id, warehouse_id')
    .eq('user_email', normalized)
    .limit(1)
    .maybeSingle();

  if (scopeErr || !scopeRow) return null;
  const storeId = (scopeRow as { store_id?: string }).store_id;
  const warehouseId = (scopeRow as { warehouse_id?: string }).warehouse_id;
  if (!storeId || !warehouseId) return null;

  const [storeRes, warehouseRes] = await Promise.all([
    supabase.from('stores').select('id, name').eq('id', storeId).maybeSingle(),
    supabase.from('warehouses').select('id, name, code').eq('id', warehouseId).maybeSingle(),
  ]);
  const store = storeRes.data as { name?: string } | null;
  const warehouse = warehouseRes.data as { name?: string; code?: string } | null;

  return {
    storeId,
    warehouseId,
    storeName: store?.name ?? '',
    warehouseName: warehouse?.name ?? '',
    warehouseCode: warehouse?.code ?? '',
  };
}

/** List scopes for an email (admin). */
export async function listScopesForEmail(email: string): Promise<UserScope[]> {
  const normalized = email?.trim()?.toLowerCase();
  if (!normalized) return [];

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('user_scopes')
    .select('store_id, warehouse_id')
    .eq('user_email', normalized);

  if (error) {
    console.error('[userScopes] listScopesForEmail', error.message);
    return [];
  }

  const rows = (data ?? []) as Array<{ store_id?: string; warehouse_id?: string }>;
  if (rows.length === 0) return [];

  const storeIds = [...new Set(rows.map((r) => r.store_id).filter(Boolean) as string[])];
  const warehouseIds = [...new Set(rows.map((r) => r.warehouse_id).filter(Boolean) as string[])];
  const [storesRes, warehousesRes] = await Promise.all([
    storeIds.length ? supabase.from('stores').select('id, name').in('id', storeIds) : { data: [] },
    warehouseIds.length ? supabase.from('warehouses').select('id, name, code').in('id', warehouseIds) : { data: [] },
  ]);
  const storesMap = new Map((storesRes.data ?? []).map((s: { id: string; name?: string }) => [s.id, s.name ?? '']));
  const warehousesMap = new Map(
    (warehousesRes.data ?? []).map((w: { id: string; name?: string; code?: string }) => [w.id, { name: w.name ?? '', code: w.code ?? '' }])
  );

  return rows.map((row) => {
    const wid = row.warehouse_id ?? '';
    const wh = warehousesMap.get(wid);
    return {
      storeId: String(row.store_id ?? ''),
      warehouseId: wid,
      storeName: storesMap.get(row.store_id ?? ''),
      warehouseName: wh?.name,
      warehouseCode: wh?.code,
    };
  });
}

/** Set scopes for a user (admin). Replaces existing. */
export async function setScopesForUser(
  email: string,
  scopes: Array<{ storeId: string; warehouseId: string }>
): Promise<void> {
  const normalized = email?.trim()?.toLowerCase();
  if (!normalized) throw new Error('email required');

  const supabase = getSupabase();
  await supabase.from('user_scopes').delete().eq('user_email', normalized);

  if (scopes.length === 0) return;

  const rows = scopes.map((s) => ({
    user_email: normalized,
    store_id: s.storeId.trim(),
    warehouse_id: s.warehouseId.trim(),
    created_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('user_scopes').insert(rows);
  if (error) throw new Error(error.message);
}
