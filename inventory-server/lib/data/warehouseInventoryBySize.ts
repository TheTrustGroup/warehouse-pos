/**
 * Per-size inventory: quantity per (warehouse, product, size_code).
 * Additive only; warehouse_inventory (total) remains source for POS deduction.
 * When product has size_kind = 'sized', we read/write here and keep warehouse_inventory.quantity in sync (sum).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const TABLE = 'warehouse_inventory_by_size';

const getSupabase = (): SupabaseClient => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
};

const now = () => new Date().toISOString();

export interface QuantityBySizeEntry {
  sizeCode: string;
  quantity: number;
}

/** Get quantity by size for one product in one warehouse. Returns array of { sizeCode, quantity }. */
export async function getQuantitiesBySize(
  warehouseId: string,
  productId: string
): Promise<QuantityBySizeEntry[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select('size_code, quantity')
    .eq('warehouse_id', warehouseId)
    .eq('product_id', productId);
  if (error) throw error;
  return (data ?? []).map((row: { size_code: string; quantity: number }) => ({
    sizeCode: row.size_code,
    quantity: Number(row.quantity),
  }));
}

/** Get quantities by size for many products in one warehouse. Returns Map<productId, QuantityBySizeEntry[]>. */
export async function getQuantitiesBySizeForProducts(
  warehouseId: string,
  productIds: string[]
): Promise<Map<string, QuantityBySizeEntry[]>> {
  if (productIds.length === 0) return new Map();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select('product_id, size_code, quantity')
    .eq('warehouse_id', warehouseId)
    .in('product_id', productIds);
  if (error) throw error;
  const map = new Map<string, QuantityBySizeEntry[]>();
  for (const row of (data ?? []) as { product_id: string; size_code: string; quantity: number }[]) {
    const list = map.get(row.product_id) ?? [];
    list.push({ sizeCode: row.size_code, quantity: Number(row.quantity) });
    map.set(row.product_id, list);
  }
  return map;
}

/**
 * Return product IDs that have at least one row in warehouse_inventory_by_size for the given warehouse(s).
 * Used so list can show sizes even when warehouse_products.size_kind was not set to 'sized' (e.g. legacy data or missed update).
 */
export async function getProductIdsWithBySizeData(
  warehouseIds: string[],
  productIds: string[]
): Promise<Set<string>> {
  if (warehouseIds.length === 0 || productIds.length === 0) return new Set();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select('product_id')
    .in('warehouse_id', warehouseIds)
    .in('product_id', productIds);
  if (error) throw error;
  const set = new Set<string>();
  for (const row of (data ?? []) as { product_id: string }[]) {
    set.add(row.product_id);
  }
  return set;
}

/**
 * Set quantities by size for (warehouse, product). Replaces all rows for this (warehouse, product).
 * Does NOT update warehouse_inventory total; caller must set that to sum(quantity) for POS.
 */
export async function setQuantitiesBySize(
  warehouseId: string,
  productId: string,
  entries: QuantityBySizeEntry[]
): Promise<void> {
  const supabase = getSupabase();
  const ts = now();
  const { error: delErr } = await supabase
    .from(TABLE)
    .delete()
    .eq('warehouse_id', warehouseId)
    .eq('product_id', productId);
  if (delErr) throw delErr;
  const toInsert = entries
    .filter((e) => e.sizeCode && Number(e.quantity) >= 0)
    .map((e) => ({
      warehouse_id: warehouseId,
      product_id: productId,
      size_code: e.sizeCode,
      quantity: Math.max(0, Math.floor(Number(e.quantity))),
      updated_at: ts,
    }));
  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from(TABLE).insert(toInsert);
    if (insErr) throw insErr;
  }
}
