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
import { notifyInventoryUpdated } from '@/lib/cache/dashboardStatsCache';
import { captureApiError } from '@/lib/sentryApi';

export const dynamic = 'force-dynamic';
/** Allow time for record_sale RPC + cache invalidation (cold start, Supabase). Avoid 504 on slow DB. */
export const maxDuration = 25;

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
  const to = searchParams.get('to')?.trim() ?? '';
  const pendingOnly = searchParams.get('pending') === 'true';
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
    const salesSelectBase =
      'id, warehouse_id, customer_name, payment_method, subtotal, discount_pct, discount_amt, total, receipt_id, status, sold_by_email, item_count, created_at';
    const salesSelectWithDelivery =
      salesSelectBase +
      ', delivery_status, recipient_name, recipient_phone, delivery_address, delivery_notes, expected_date, delivered_at, delivered_by';
    let query = supabase
      .from('sales')
      .select(salesSelectWithDelivery)
      .eq('warehouse_id', effectiveWarehouseId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);
    if (pendingOnly) query = query.in('delivery_status', ['pending', 'dispatched', 'cancelled']);
    let salesRows: unknown[] | null = null;
    let salesError: { message: string } | null = null;
    const result = await query;
    salesRows = result.data as unknown[] | null;
    salesError = result.error as { message: string } | null;
    if (salesError && /column.*does not exist|relation.*delivery/i.test(salesError.message)) {
      let fallback = supabase
        .from('sales')
        .select(salesSelectBase)
        .eq('warehouse_id', effectiveWarehouseId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (from) fallback = fallback.gte('created_at', from);
      if (to) fallback = fallback.lte('created_at', to);
      const fallbackResult = await fallback;
      salesError = fallbackResult.error as { message: string } | null;
      salesRows = fallbackResult.data as unknown[] | null;
    }
    if (salesError) {
      logApiResponse(req, 500, Date.now() - start, { message: salesError.message });
      captureApiError(500, 'GET /api/sales: failed to load sales', { path: req.url, message: salesError.message });
      return withCors(NextResponse.json({ error: 'Failed to load sales. Please try again.' }, { status: 500, headers: h }), req);
    }
    type SalesRow = {
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
      delivery_status?: string | null;
      recipient_name?: string | null;
      recipient_phone?: string | null;
      delivery_address?: string | null;
      delivery_notes?: string | null;
      expected_date?: string | null;
      delivered_at?: string | null;
      delivered_by?: string | null;
    };
    const sales = (salesRows ?? []) as SalesRow[];
    const saleIds = sales.map((s) => s.id);
    const { data: linesRows } = await supabase
      .from('sale_lines')
      .select('id, sale_id, product_id, size_code, product_name, product_sku, unit_price, qty, line_total, product_image_url, cost_price')
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
        imageUrl: row.product_image_url ?? null,
        costPrice: row.cost_price != null ? Number(row.cost_price) : null,
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
      deliveryStatus: s.delivery_status ?? 'delivered',
      recipientName: s.recipient_name ?? null,
      recipientPhone: s.recipient_phone ?? null,
      deliveryAddress: s.delivery_address ?? null,
      deliveryNotes: s.delivery_notes ?? null,
      expectedDate: s.expected_date ?? null,
      deliveredAt: s.delivered_at ?? null,
      deliveredBy: s.delivered_by ?? null,
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

/** PATCH /api/sales — update delivery status (e.g. mark dispatched/delivered/cancelled). */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
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
  const saleId = typeof body.saleId === 'string' ? body.saleId.trim() : '';
  const deliveryStatus = typeof body.deliveryStatus === 'string' ? body.deliveryStatus.trim().toLowerCase() : '';
  const warehouseId = typeof body.warehouseId === 'string' ? body.warehouseId.trim() : '';
  const allowed = scope.allowedWarehouseIds;
  const isAdmin = /^(admin|super_admin)$/i.test(auth.role ?? '');
  const effectiveWarehouseId = warehouseId && (isAdmin || allowed.includes(warehouseId)) ? warehouseId : allowed[0];
  if (!saleId || !effectiveWarehouseId) {
    return withCors(
      NextResponse.json({ error: 'saleId and warehouseId are required' }, { status: 400, headers: h }),
      req
    );
  }
  const validStatuses = ['pending', 'dispatched', 'delivered', 'cancelled'];
  if (!validStatuses.includes(deliveryStatus)) {
    return withCors(
      NextResponse.json({ error: 'deliveryStatus must be one of: pending, dispatched, delivered, cancelled' }, { status: 400, headers: h }),
      req
    );
  }
  try {
    const supabase = getSupabase();
    const update: Record<string, unknown> = { delivery_status: deliveryStatus };
    if (deliveryStatus === 'delivered') {
      update.delivered_at = new Date().toISOString();
      update.delivered_by = auth.email ?? null;
    }
    const { data, error } = await supabase
      .from('sales')
      .update(update)
      .eq('id', saleId)
      .eq('warehouse_id', effectiveWarehouseId)
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[PATCH /api/sales]', error.message);
      return withCors(NextResponse.json({ error: 'Failed to update delivery status' }, { status: 500, headers: h }), req);
    }
    if (!data) {
      return withCors(NextResponse.json({ error: 'Sale not found or not in your warehouse' }, { status: 404, headers: h }), req);
    }
    return withCors(NextResponse.json({ ok: true, id: saleId, deliveryStatus }, { headers: h }), req);
  } catch (e) {
    console.error('[PATCH /api/sales]', e);
    return withCors(NextResponse.json({ error: 'Failed to update delivery status' }, { status: 500, headers: h }), req);
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
  const rawPaymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod : 'cash';
  const paymentMethod = rawPaymentMethod.trim().toLowerCase() || 'cash';
  const allowedMethods = ['cash', 'card', 'mobile_money', 'mixed'];
  const paymentMethodForDb = allowedMethods.includes(paymentMethod) ? paymentMethod : 'cash';
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
  if (paymentMethodForDb === 'mixed') {
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
      p_payment_method: paymentMethodForDb,
      p_customer_name: customerName,
      p_sold_by: null,
      p_sold_by_email: auth.email,
    });
    if (error) {
      const msg = error.message ?? 'Failed to record sale';
      const isStock = /INSUFFICIENT_STOCK|insufficient stock/i.test(msg);
      const isConstraint = /check constraint|violates|payment_method|candidate function/i.test(msg);
      console.error('[POST /api/sales] RPC error:', msg);
      const errorPayload: Record<string, unknown> = {
        error: isStock
          ? 'Insufficient stock for one or more items. Adjust the cart and try again.'
          : isConstraint
            ? msg
            : 'Failed to record sale. Please try again.',
        code: isStock ? 'INSUFFICIENT_STOCK' : undefined,
      };
      if (!isStock && msg) errorPayload.detail = msg;
      return withCors(
        NextResponse.json(errorPayload, { status: isStock ? 422 : 500, headers: h }),
        req
      );
    }
    await notifyInventoryUpdated(warehouseId);
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
