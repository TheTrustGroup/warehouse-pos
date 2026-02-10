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

/** Server-derived context (from session). All optional; no blocking. */
export interface ProcessSaleSessionContext {
  storeId?: string | null;
  posId?: string | null;
  operatorId?: string | null;
}

/**
 * Get transaction by idempotency key (Phase 4). Returns null if not found.
 */
export async function getTransactionByIdempotencyKey(idempotencyKey: string): Promise<{ id: string } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('transactions')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: (data as { id: string }).id } : null;
}

/**
 * Persist sale: transaction + items + deduct + stock_movements. Atomic.
 * sessionContext: optional store_id, pos_id, operator_id from session (Phase 2). If missing, columns stay NULL.
 * idempotencyKey: optional; when set, duplicate key returns existing tx (no double deduction).
 * Throws on insufficient stock (message contains INSUFFICIENT_STOCK) or validation error.
 */
export async function processSale(
  payload: ProcessSalePayload,
  sessionContext?: ProcessSaleSessionContext,
  idempotencyKey?: string | null
): Promise<{ id: string }> {
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
  const storeId = sessionContext?.storeId != null && String(sessionContext.storeId).trim() ? sessionContext.storeId.trim() : null;
  const posId = sessionContext?.posId != null && String(sessionContext.posId).trim() ? sessionContext.posId.trim() : null;
  const operatorId = sessionContext?.operatorId != null && String(sessionContext.operatorId).trim() ? sessionContext.operatorId.trim() : null;
  const { data, error } = await supabase.rpc('process_sale', {
    p_warehouse_id: warehouseId,
    p_transaction: transaction,
    p_items: items,
    p_store_id: storeId || null,
    p_pos_id: posId || null,
    p_operator_id: operatorId || null,
    p_idempotency_key: (idempotencyKey?.trim() || null) ?? null,
  });
  if (error) {
    const err = new Error(error.message) as Error & { status?: number };
    err.status = error.message?.includes('INSUFFICIENT_STOCK') ? 409 : 400;
    throw err;
  }
  return { id: data as string };
}

/** Filters for list (all optional). scope* = enforce allowed ids when non-empty (Phase 3). */
export interface ListTransactionsFilters {
  warehouse_id?: string;
  store_id?: string;
  pos_id?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  /** When set, restrict to these store ids (scope enforcement). */
  scopeStoreIds?: string[] | null;
  /** When set, restrict to these warehouse ids (scope enforcement). */
  scopeWarehouseIds?: string[] | null;
  /** When set, restrict to these pos_id values (scope enforcement). */
  scopePosIds?: string[] | null;
}

/** Single transaction row as returned from DB (snake_case). */
export interface TransactionRow {
  id: string;
  transaction_number: string;
  type: string;
  warehouse_id: string | null;
  store_id: string | null;
  pos_id: string | null;
  operator_id: string | null;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  payment_method: string;
  payments: unknown;
  cashier: string;
  customer: unknown;
  status: string;
  sync_status: string;
  created_at: string;
  completed_at: string | null;
}

/** Transaction with items for API response. */
export interface TransactionWithItems extends TransactionRow {
  items?: Array<{
    product_id: string;
    product_name: string;
    sku: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * List transactions (read-only, admin). Uses indexed columns. No mutation.
 */
export async function listTransactions(filters: ListTransactionsFilters): Promise<{
  data: TransactionWithItems[];
  total: number;
}> {
  const supabase = getSupabase();
  const limit = Math.min(Math.max(1, filters.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const offset = Math.max(0, filters.offset ?? 0);

  let query = supabase
    .from('transactions')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.warehouse_id?.trim()) {
    query = query.eq('warehouse_id', filters.warehouse_id.trim());
  }
  if (filters.store_id?.trim()) {
    query = query.eq('store_id', filters.store_id.trim());
  }
  if (filters.pos_id?.trim()) {
    query = query.eq('pos_id', filters.pos_id.trim());
  }
  if (filters.scopeStoreIds != null && filters.scopeStoreIds.length > 0) {
    query = query.in('store_id', filters.scopeStoreIds);
  }
  if (filters.scopeWarehouseIds != null && filters.scopeWarehouseIds.length > 0) {
    query = query.in('warehouse_id', filters.scopeWarehouseIds);
  }
  if (filters.scopePosIds != null && filters.scopePosIds.length > 0) {
    query = query.in('pos_id', filters.scopePosIds);
  }
  if (filters.from?.trim()) {
    query = query.gte('created_at', filters.from.trim());
  }
  if (filters.to?.trim()) {
    query = query.lte('created_at', filters.to.trim());
  }

  const { data: rows, error, count } = await query;
  if (error) throw error;

  const transactions = (rows ?? []) as TransactionRow[];
  if (transactions.length === 0) {
    return { data: [], total: count ?? 0 };
  }

  const ids = transactions.map((t) => t.id);
  const { data: itemsRows } = await supabase
    .from('transaction_items')
    .select('transaction_id, product_id, product_name, sku, quantity, unit_price, subtotal')
    .in('transaction_id', ids);

  const itemsByTx = new Map<string, TransactionWithItems['items']>();
  for (const row of (itemsRows ?? []) as Array<{ transaction_id: string; product_id: string; product_name: string; sku: string; quantity: number; unit_price: number; subtotal: number }>) {
    const list = itemsByTx.get(row.transaction_id) ?? [];
    list.push({
      product_id: row.product_id,
      product_name: row.product_name,
      sku: row.sku,
      quantity: row.quantity,
      unit_price: row.unit_price,
      subtotal: row.subtotal,
    });
    itemsByTx.set(row.transaction_id, list);
  }

  const data: TransactionWithItems[] = transactions.map((t) => ({
    ...t,
    items: itemsByTx.get(t.id) ?? [],
  }));

  return { data, total: count ?? 0 };
}
