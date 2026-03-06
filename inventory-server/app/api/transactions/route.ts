/**
 * GET /api/transactions — list sales as transaction rows for Reports (from, to, warehouse_id).
 * Returns { data: TransactionApiRow[], total } for compatibility with reportsApi/transactionsApi.
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { requireAuth } from '@/lib/auth/session';
import { getScopeForUser } from '@/lib/data/userScopes';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 25;

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const h = corsHeaders(req);
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return withCors(auth, req);

  const scope = await getScopeForUser(auth.email);
  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get('warehouse_id')?.trim() ?? '';
  const from = searchParams.get('from')?.trim() ?? '';
  const to = searchParams.get('to')?.trim() ?? '';
  const limit = Math.min(Number(searchParams.get('limit')) || 500, 2000);
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

  const allowed = scope.allowedWarehouseIds;
  const isAdmin = /^(admin|super_admin)$/i.test(auth.role ?? '');
  const effectiveWarehouseId =
    warehouseId && (isAdmin || allowed.includes(warehouseId)) ? warehouseId : allowed[0] ?? '';

  if (!effectiveWarehouseId) {
    return withCors(
      NextResponse.json({ error: 'warehouse_id required or no warehouse access' }, { status: 400, headers: h }),
      req
    );
  }

  try {
    const supabase = getSupabase();
    let query = supabase
      .from('sales')
      .select(
        'id, warehouse_id, customer_name, payment_method, subtotal, discount_pct, discount_amt, total, receipt_id, status, sold_by_email, item_count, created_at'
      )
      .eq('warehouse_id', effectiveWarehouseId)
      .neq('status', 'voided')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data: salesRows, error: salesError } = await query;

    if (salesError) {
      console.error('[GET /api/transactions]', salesError.message);
      return withCors(
        NextResponse.json({ error: salesError.message ?? 'Failed to load transactions' }, { status: 500, headers: h }),
        req
      );
    }

    const sales = (salesRows ?? []) as Array<{
      id: string;
      warehouse_id: string;
      customer_name: string | null;
      payment_method: string;
      subtotal: number;
      discount_pct: number;
      discount_amt: number;
      total: number;
      receipt_id: string;
      status: string;
      sold_by_email: string | null;
      item_count: number;
      created_at: string;
    }>;

    const saleIds = sales.map((s) => s.id);
    const { data: linesRows } = await supabase
      .from('sale_lines')
      .select('sale_id, product_id, product_name, product_sku, unit_price, qty, line_total')
      .in('sale_id', saleIds);

    const linesBySale = (linesRows ?? []).reduce<Record<string, Array<{
      product_id: string;
      product_name: string;
      sku: string;
      quantity: number;
      unit_price: number;
      subtotal: number;
    }>>>((acc, row: Record<string, unknown>) => {
      const sid = String(row.sale_id);
      if (!acc[sid]) acc[sid] = [];
      acc[sid].push({
        product_id: String(row.product_id ?? ''),
        product_name: String(row.product_name ?? ''),
        sku: String(row.product_sku ?? ''),
        quantity: Number(row.qty ?? 0),
        unit_price: Number(row.unit_price ?? 0),
        subtotal: Number(row.line_total ?? 0),
      });
      return acc;
    }, {});

    const data = sales.map((s) => ({
      id: s.id,
      transaction_number: s.receipt_id,
      type: 'sale',
      warehouse_id: s.warehouse_id,
      store_id: null as string | null,
      pos_id: null as string | null,
      operator_id: null as string | null,
      subtotal: Number(s.subtotal),
      tax: 0,
      discount: Number(s.discount_amt ?? 0),
      total: Number(s.total),
      payment_method: s.payment_method ?? 'cash',
      payments: [] as unknown[],
      cashier: s.sold_by_email ?? '',
      customer: s.customer_name,
      status: s.status === 'voided' ? 'voided' : 'completed',
      sync_status: 'synced',
      created_at: s.created_at,
      completed_at: s.created_at,
      items: linesBySale[s.id] ?? [],
    }));

    return withCors(
      NextResponse.json({ data, total: data.length }, { headers: h }),
      req
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load transactions';
    console.error('[GET /api/transactions]', msg);
    return withCors(
      NextResponse.json({ error: msg }, { status: 500, headers: h }),
      req
    );
  }
}
