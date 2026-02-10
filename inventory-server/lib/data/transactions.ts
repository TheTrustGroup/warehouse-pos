/**
 * Durable transaction persistence. Calls process_sale RPC: insert transaction + items +
 * deduct inventory + stock_movements in one atomic transaction.
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

/** Payload from client: transaction + items. warehouseId required. */
export interface ProcessSalePayload {
  id: string;
  transactionNumber: string;
  type: string;
  warehouseId: string;
  items: Array<{ productId: string; productName: string; sku: string; quantity: number; unitPrice: number; subtotal: number }>;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: string;
  payments: unknown[];
  cashier: string;
  customer?: unknown;
  status: string;
  syncStatus: string;
  createdAt: string;
  completedAt: string | null;
}

/**
 * Persist sale: transaction + items + deduct + stock_movements. Atomic.
 * Throws on insufficient stock (message contains INSUFFICIENT_STOCK) or validation error.
 */
export async function processSale(payload: ProcessSalePayload): Promise<{ id: string }> {
  const supabase = getSupabase();
  const { warehouseId, items, ...rest } = payload;
  if (!warehouseId || !items?.length) {
    throw new Error('warehouseId and non-empty items required');
  }
  const transaction = {
    ...rest,
    id: payload.id,
    transactionNumber: payload.transactionNumber,
    type: payload.type ?? 'sale',
    subtotal: payload.subtotal,
    tax: payload.tax,
    discount: payload.discount,
    total: payload.total,
    paymentMethod: payload.paymentMethod,
    payments: payload.payments ?? [],
    cashier: payload.cashier ?? '',
    customer: payload.customer ?? null,
    status: payload.status ?? 'completed',
    syncStatus: payload.syncStatus ?? 'synced',
    createdAt: payload.createdAt,
    completedAt: payload.completedAt ?? null,
  };
  const { data, error } = await supabase.rpc('process_sale', {
    p_warehouse_id: warehouseId,
    p_transaction: transaction,
    p_items: items,
  });
  if (error) {
    const err = new Error(error.message) as Error & { status?: number };
    err.status = error.message?.includes('INSUFFICIENT_STOCK') ? 409 : 400;
    throw err;
  }
  return { id: data as string };
}
