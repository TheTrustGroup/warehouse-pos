/**
 * Warehouse-scoped inventory. Quantity per (warehouse_id, product_id).
 * Table: warehouse_inventory (Supabase). Used by products API when reading/updating quantity.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const TABLE = 'warehouse_inventory';

const getSupabase = (): SupabaseClient => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
};

const now = () => new Date().toISOString();

/** Get quantity for one product in one warehouse. Returns 0 if no row. */
export async function getQuantity(warehouseId: string, productId: string): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select('quantity')
    .eq('warehouse_id', warehouseId)
    .eq('product_id', productId)
    .maybeSingle();
  if (error) throw error;
  return data ? Number((data as { quantity: number }).quantity) : 0;
}

/** Get all product quantities for a warehouse. Returns Map<productId, quantity>. */
export async function getQuantitiesForWarehouse(warehouseId: string): Promise<Map<string, number>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select('product_id, quantity')
    .eq('warehouse_id', warehouseId);
  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of (data ?? []) as { product_id: string; quantity: number }[]) {
    map.set(row.product_id, Number(row.quantity));
  }
  return map;
}

/** Get quantities for specific products in a warehouse. Returns Map<productId, quantity>. */
export async function getQuantitiesForProducts(
  warehouseId: string,
  productIds: string[]
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select('product_id, quantity')
    .eq('warehouse_id', warehouseId)
    .in('product_id', productIds);
  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of (data ?? []) as { product_id: string; quantity: number }[]) {
    map.set(row.product_id, Number(row.quantity));
  }
  return map;
}

/** Set quantity for (warehouse_id, product_id). Upserts. */
export async function setQuantity(
  warehouseId: string,
  productId: string,
  quantity: number
): Promise<void> {
  const supabase = getSupabase();
  const ts = now();
  const { error } = await supabase.from(TABLE).upsert(
    {
      warehouse_id: warehouseId,
      product_id: productId,
      quantity: Math.max(0, Math.floor(quantity)),
      updated_at: ts,
    },
    { onConflict: 'warehouse_id,product_id' }
  );
  if (error) throw error;
}

/** Ensure a row exists for (warehouse_id, product_id) with quantity (e.g. on product create). */
export async function ensureQuantity(
  warehouseId: string,
  productId: string,
  quantity: number
): Promise<void> {
  return setQuantity(warehouseId, productId, quantity);
}

/** Item for batch deduct (productId + quantity). */
export interface DeductItem {
  productId: string;
  quantity: number;
}

/**
 * Atomic batch deduction for POS sale. Runs in one DB transaction.
 * Throws with message containing INSUFFICIENT_STOCK if any line would go negative.
 */
export async function processSaleDeductions(
  warehouseId: string,
  items: DeductItem[]
): Promise<void> {
  if (items.length === 0) return;
  const supabase = getSupabase();
  const payload = items.map((i) => ({
    productId: i.productId,
    quantity: Math.max(0, Math.floor(i.quantity)),
  }));
  const { error } = await supabase.rpc('process_sale_deductions', {
    p_warehouse_id: warehouseId,
    p_items: payload,
  });
  if (error) {
    const err = new Error(error.message) as Error & { status?: number };
    err.status = error.message?.includes('INSUFFICIENT_STOCK') ? 409 : 400;
    throw err;
  }
}

/** Item for batch add (return stock). */
export interface ReturnItem {
  productId: string;
  quantity: number;
}

/**
 * Atomic batch add for order returns. Runs in one DB transaction.
 */
export async function processReturnStock(
  warehouseId: string,
  items: ReturnItem[]
): Promise<void> {
  if (items.length === 0) return;
  const supabase = getSupabase();
  const payload = items.map((i) => ({
    productId: i.productId,
    quantity: Math.max(0, Math.floor(i.quantity)),
  }));
  const { error } = await supabase.rpc('process_return_stock', {
    p_warehouse_id: warehouseId,
    p_items: payload,
  });
  if (error) {
    const err = new Error(error.message) as Error & { status?: number };
    err.status = 400;
    throw err;
  }
}
