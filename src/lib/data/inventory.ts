/**
 * INVENTORY — SINGLE SOURCE OF TRUTH
 * SERVER ONLY. Do not import from client code. Use in API routes or Node backend.
 *
 * Rules: No caching. No duplication. No fallback logic.
 * Every call hits the database. No in-memory cache, no localStorage, no merge.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const getSupabase = (): SupabaseClient => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key, { auth: { persistSession: false } });
};

/** Table name for inventory rows (adjust to match your schema, e.g. warehouse_products). */
const INVENTORY_TABLE = process.env.INVENTORY_TABLE ?? 'inventory';

export interface InventoryItem {
  id: string;
  warehouse_id: string;
  product_id: string;
  quantity: number;
  [key: string]: unknown;
}

export interface AddInventoryItemData {
  warehouse_id: string;
  product_id: string;
  quantity: number;
  [key: string]: unknown;
}

/**
 * Get all inventory for a warehouse. No cache. No fallback.
 */
export async function getInventory(warehouseId: string): Promise<InventoryItem[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(INVENTORY_TABLE)
    .select('*')
    .eq('warehouse_id', warehouseId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as InventoryItem[];
}

/**
 * Add one inventory item. No cache. No fallback.
 */
export async function addInventoryItem(data: AddInventoryItemData): Promise<InventoryItem> {
  const supabase = getSupabase();
  const { data: row, error } = await supabase
    .from(INVENTORY_TABLE)
    .insert({
      warehouse_id: data.warehouse_id,
      product_id: data.product_id,
      quantity: data.quantity,
    })
    .select()
    .single();
  if (error) throw error;
  return row as InventoryItem;
}

/**
 * Update quantity for an inventory item by id. No cache. No fallback.
 */
export async function updateInventoryItem(id: string, qty: number): Promise<InventoryItem> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(INVENTORY_TABLE)
    .update({ quantity: qty, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as InventoryItem;
}
