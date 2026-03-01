/**
 * Fetch sales from GET /api/sales for Reports and other consumers.
 * Maps server sales to Transaction[] for reportService.generateSalesReport.
 */

import { Transaction, type Payment } from '../types';
import { apiGet } from '../lib/apiClient';

export interface SaleLine {
  id: string;
  productId: string;
  sizeCode: string | null;
  name: string;
  sku: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

export interface SaleFromApi {
  id: string;
  receiptId: string;
  warehouseId: string;
  customerName: string | null;
  paymentMethod: 'Cash' | 'MoMo' | 'Card';
  subtotal: number;
  discountPct: number;
  discountAmt: number;
  total: number;
  itemCount: number;
  soldBy: string | null;
  createdAt: string;
  lines: SaleLine[];
}

export interface FetchSalesParams {
  from: string;
  to: string;
  warehouse_id?: string;
  limit?: number;
}

function paymentMethodForReport(m: string): Payment['method'] {
  const lower = (m ?? '').toLowerCase();
  if (lower === 'cash') return 'cash';
  if (lower === 'momo' || lower === 'mobile_money') return 'mobile_money';
  if (lower === 'card') return 'card';
  return 'cash';
}

/**
 * Map a sale from GET /api/sales to Transaction for generateSalesReport.
 */
export function saleToTransaction(sale: SaleFromApi): Transaction {
  return {
    id: sale.id,
    transactionNumber: sale.receiptId ?? sale.id,
    type: 'sale',
    items: (sale.lines ?? []).map((l) => ({
      productId: l.productId,
      productName: l.name ?? '',
      sku: l.sku ?? '',
      quantity: l.qty,
      unitPrice: l.unitPrice,
      subtotal: l.lineTotal,
    })),
    subtotal: sale.subtotal,
    tax: 0,
    discount: sale.discountAmt ?? 0,
    total: sale.total,
    paymentMethod: paymentMethodForReport(sale.paymentMethod) as Transaction['paymentMethod'],
    payments: [{ method: paymentMethodForReport(sale.paymentMethod), amount: sale.total }],
    cashier: sale.soldBy ?? '',
    customer: undefined,
    status: 'completed',
    syncStatus: 'synced',
    createdAt: new Date(sale.createdAt),
    completedAt: new Date(sale.createdAt),
    warehouseId: sale.warehouseId,
  };
}

/**
 * Fetch sales from GET /api/sales (from, to, warehouse_id). Returns sales and total.
 */
export async function fetchSalesFromApi(
  baseUrl: string,
  params: FetchSalesParams
): Promise<{ data: SaleFromApi[]; total: number }> {
  const searchParams = new URLSearchParams();
  searchParams.set('from', params.from);
  searchParams.set('to', params.to);
  if (params.warehouse_id) searchParams.set('warehouse_id', params.warehouse_id);
  if (params.limit != null) searchParams.set('limit', String(params.limit));

  const path = `/api/sales?${searchParams.toString()}`;
  const res = await apiGet<{ data?: SaleFromApi[]; total?: number }>(baseUrl, path);
  const data = Array.isArray(res?.data) ? res.data : [];
  const total = typeof res?.total === 'number' ? res.total : data.length;
  return { data, total };
}

/**
 * Fetch sales and convert to Transaction[] for report generation.
 */
export async function fetchSalesAsTransactions(
  baseUrl: string,
  params: FetchSalesParams
): Promise<{ data: Transaction[]; total: number }> {
  const { data, total } = await fetchSalesFromApi(baseUrl, params);
  return { data: data.map(saleToTransaction), total };
}
