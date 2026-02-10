/**
 * Read-only API for transactions (admin). Used by Reports to show server-backed sales.
 * Graceful fallback to localStorage when API is unavailable or user is not admin.
 */

import { Transaction } from '../types';
import { apiGet } from '../lib/apiClient';

export interface FetchTransactionsParams {
  from: string; // ISO datetime
  to: string;
  warehouse_id?: string;
  store_id?: string;
  pos_id?: string;
  limit?: number;
  offset?: number;
}

/** API response row (snake_case). */
interface TransactionApiRow {
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
  items?: Array<{
    product_id: string;
    product_name: string;
    sku: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
}

function rowToTransaction(row: TransactionApiRow): Transaction {
  return {
    id: row.id,
    transactionNumber: row.transaction_number,
    type: (row.type as Transaction['type']) || 'sale',
    items: (row.items ?? []).map((i) => ({
      productId: i.product_id,
      productName: i.product_name,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unit_price,
      subtotal: i.subtotal,
    })),
    subtotal: Number(row.subtotal),
    tax: Number(row.tax),
    discount: Number(row.discount),
    total: Number(row.total),
    paymentMethod: (row.payment_method as Transaction['paymentMethod']) || 'cash',
    payments: Array.isArray(row.payments) ? row.payments : [],
    cashier: row.cashier ?? '',
    customer: row.customer as Transaction['customer'],
    status: (row.status as Transaction['status']) || 'completed',
    syncStatus: (row.sync_status as Transaction['syncStatus']) || 'synced',
    createdAt: new Date(row.created_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    warehouseId: row.warehouse_id ?? undefined,
    storeId: row.store_id ?? undefined,
    posId: row.pos_id ?? undefined,
  };
}

/**
 * Fetch transactions from GET /api/transactions (admin only). Returns normalized Transaction[].
 * Throws on non-2xx or network error. Caller should catch and fall back to localStorage.
 */
export async function fetchTransactionsFromApi(
  baseUrl: string,
  params: FetchTransactionsParams
): Promise<{ data: Transaction[]; total: number }> {
  const searchParams = new URLSearchParams();
  searchParams.set('from', params.from);
  searchParams.set('to', params.to);
  if (params.warehouse_id) searchParams.set('warehouse_id', params.warehouse_id);
  if (params.store_id) searchParams.set('store_id', params.store_id);
  if (params.pos_id) searchParams.set('pos_id', params.pos_id);
  if (params.limit != null) searchParams.set('limit', String(params.limit));
  if (params.offset != null) searchParams.set('offset', String(params.offset));

  const path = `/api/transactions?${searchParams.toString()}`;
  const res = await apiGet<{ data?: TransactionApiRow[]; total?: number }>(baseUrl, path);
  const data = Array.isArray(res?.data) ? res.data : [];
  const total = typeof res?.total === 'number' ? res.total : data.length;
  return { data: data.map(rowToTransaction), total };
}
