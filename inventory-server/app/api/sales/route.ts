/**
 * GET /api/sales — list sales for a warehouse (optional from date, limit).
 * POST /api/sales — record a sale (record_sale RPC); requires auth for sold_by_email.
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { logApiResponse } from '../../../lib/requestLog';
import { requirePosRole } from '@/lib/auth/session';
import { getScopeForUser } from '@/lib/data/userScopes';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const start = Date.now();
  const h = corsHeaders(req);
  const logAndReturn = (res: NextResponse) => {
    logApiResponse(req, res.status, Date.now() - start);
    return res;
  };
  const auth = await requirePosRole(req);
  if (auth instanceof NextResponse) return withCors(auth, req);
  const scope = await getScopeForUser(auth.email);
  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get('warehouse_id')?.trim() ?? '';
  const from = searchParams.get('from')?.trim() ?? '';
  const limit = Math.min(Number(searchParams.get('limit')) || 500, 500);
  const allowed = scope.allowedWarehouseIds;
  const isAdmin = /^(admin|super_admin)$/i.test(auth.role ?? '');
  const effectiveWarehouseId = warehouseId && (isAdmin || allowed.includes(warehouseId)) ? warehouseId : allowed[0];
  if (!effectiveWarehouseId) {
    return logAndReturn(
      withCors(
        NextResponse.json({ error: 'warehouse_id required or no warehouse access' }, { status: 400, headers: h }),
        req
      )
    );
  }
  try {
    const supabase = getSupabase();
    let query = supabase
      .from('sales')
      .select('id, warehouse_id, customer_name, payment_method, subtotal, discount_pct, discount_amt, total, receipt_id, status, sold_by_email, item_count, created_at')
      .eq('warehouse_id', effectiveWarehouseId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (from) query = query.gte('created_at', from);
    const { data: salesRows, error: salesError } = await query;
    if (salesError) {
      logApiResponse(req, 500, Date.now() - start, { message: salesError.message });
      return withCors(NextResponse.json({ error: 'Failed to load sales. Please try again.' }, { status: 500, headers: h }), req);
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
      .select('id, sale_id, product_id, size_code, product_name, product_sku, unit_price, qty, line_total')
      .in('sale_id', saleIds);
    const linesBySale = (linesRows ?? []).reduce<Record<string, unknown[]>>((acc, row: Record<string, unknown>) => {
      const sid = String(row.sale_id);
      if (!acc[sid]) acc[sid] = [];
      acc[sid].push({
        id: row.id,
        productId: row.product_id,
        sizeCode: row.size_code ?? null,
        name: row.product_name ?? '',
        sku: row.product_sku ?? '',
        unitPrice: Number(row.unit_price ?? 0),
        qty: Number(row.qty ?? 0),
        lineTotal: Number(row.line_total ?? 0),
      });
      return acc;
    }, {});
    const list = sales.map((s) => ({
      id: s.id,
      receiptId: s.receipt_id,
      warehouseId: s.warehouse_id,
      customerName: s.customer_name,
      paymentMethod: s.payment_method,
      subtotal: Number(s.subtotal),
      discountPct: Number(s.discount_pct),
      discountAmt: Number(s.discount_amt),
      total: Number(s.total),
      itemCount: Number(s.item_count ?? 0),
      soldBy: s.sold_by_email,
      createdAt: s.created_at,
      status: s.status,
      voidedAt: s.status === 'voided' ? s.created_at : null,
      lines: linesBySale[s.id] ?? [],
    }));
    return logAndReturn(withCors(NextResponse.json(list, { headers: h }), req));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load sales';
    logApiResponse(req, 500, Date.now() - start, { message: msg });
    return withCors(
      NextResponse.json({ error: 'Failed to load sales. Please try again.' }, { status: 500, headers: h }),
      req
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const h = corsHeaders(req);
  const auth = await requirePosRole(req);
  if (auth instanceof NextResponse) return withCors(auth, req);
  const scope = await getScopeForUser(auth.email);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return withCors(NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: h }), req);
  }
  const warehouseId = typeof body.warehouseId === 'string' ? body.warehouseId.trim() : '';
  const allowed = scope.allowedWarehouseIds;
  const isAdmin = /^(admin|super_admin)$/i.test(auth.role ?? '');
  if (!warehouseId || (!isAdmin && !allowed.includes(warehouseId))) {
    return withCors(
      NextResponse.json({ error: 'warehouse_id required or not in your scope' }, { status: 400, headers: h }),
      req
    );
  }
  const lines = Array.isArray(body.lines) ? body.lines : [];
  const subtotal = Number(body.subtotal) ?? 0;
  const discountPct = Number(body.discountPct) ?? 0;
  const discountAmt = Number(body.discountAmt) ?? 0;
  const total = Number(body.total) ?? 0;
  const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod : 'Cash';
  const customerName = typeof body.customerName === 'string' ? body.customerName : null;
  const rawPayments = Array.isArray(body.payments) ? body.payments : null;
  const paymentsBreakdown =
    rawPayments &&
    rawPayments
      .filter(
        (p: unknown): p is { method: string; amount: number } =>
          typeof p === 'object' && p !== null && typeof (p as { method?: unknown }).method === 'string' && typeof (p as { amount?: unknown }).amount === 'number'
      )
      .map((p: { method: string; amount: number }) => ({ method: p.method, amount: Number(p.amount) }))
      .filter((p) => ['cash', 'card', 'mobile_money'].includes(p.method) && p.amount > 0);
  if (paymentMethod.toLowerCase() === 'mixed') {
    const sum = (paymentsBreakdown ?? []).reduce((s, p) => s + p.amount, 0);
    const ok = sum > 0 && Math.abs(sum - total) < 0.01;
    if (!ok || !paymentsBreakdown?.length) {
      return withCors(
        NextResponse.json(
          {
            error:
              'Mixed payment requires a payments array (method + amount) that sums to the sale total.',
          },
          { status: 400, headers: h }
        ),
        req
      );
    }
  }
  const pLines = lines.map((l: Record<string, unknown>) => ({
    productId: l.productId,
    sizeCode: l.sizeCode ?? null,
    qty: l.qty,
    unitPrice: l.unitPrice,
    lineTotal: l.lineTotal ?? (Number(l.unitPrice) * Number(l.qty)),
    name: l.name ?? 'Unknown',
    sku: l.sku ?? '',
    imageUrl: l.imageUrl ?? null,
  }));
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('record_sale', {
      p_warehouse_id: warehouseId,
      p_lines: pLines,
      p_subtotal: subtotal,
      p_discount_pct: discountPct,
      p_discount_amt: discountAmt,
      p_total: total,
      p_payment_method: paymentMethod,
      p_customer_name: customerName,
      p_sold_by: null,
      p_sold_by_email: auth.email,
      p_payments_breakdown: paymentsBreakdown ?? null,
    });
    if (error) {
      const msg = error.message ?? 'Failed to record sale';
      const isStock = /INSUFFICIENT_STOCK|insufficient stock/i.test(msg);
      console.error('[POST /api/sales] RPC error:', msg);
      return withCors(
        NextResponse.json(
          {
            error: isStock
              ? 'Insufficient stock for one or more items. Adjust the cart and try again.'
              : 'Failed to record sale. Please try again.',
            code: isStock ? 'INSUFFICIENT_STOCK' : undefined,
          },
          { status: isStock ? 422 : 500, headers: h }
        ),
        req
      );
    }
    const result = (data ?? {}) as Record<string, unknown>;
    return withCors(
      NextResponse.json(
        {
          id: result.id,
          receiptId: result.receiptId,
          total: result.total,
          itemCount: result.itemCount,
          status: result.status ?? 'completed',
          createdAt: result.createdAt ?? new Date().toISOString(),
        },
        { status: 200, headers: h }
      ),
      req
    );
  } catch (e) {
    console.error('[POST /api/sales]', e);
    return withCors(
      NextResponse.json(
        { error: 'Failed to record sale. Please try again.' },
        { status: 500, headers: h }
      ),
      req
    );
  }
}
