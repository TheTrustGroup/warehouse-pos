/**
 * INVENTORY — SINGLE SOURCE OF TRUTH
 * SERVER ONLY. Direct DB reads. No caching. No fallback.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const getSupabase = (): SupabaseClient => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key, { auth: { persistSession: false } });
};

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
