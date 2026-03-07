/**
 * POST /api/sales — record a sale via record_sale() RPC (inserts sale + sale_lines, deducts stock).
 * Auth: Bearer or session cookie; warehouse_id must be in user scope.
 * Body: warehouseId, customerName?, customerEmail?, paymentMethod, payments?, subtotal, discountPct?, discountAmt?, total, lines[], deliverySchedule?.
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { getRequestId, jsonError } from '@/lib/apiResponse';
import { logApiResponse } from '@/lib/requestLog';
import { requireAuth, getEffectiveWarehouseId } from '@/lib/auth/session';
import { getScopeForUser } from '@/lib/data/userScopes';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  const h = corsHeaders(req);
  Object.entries(h).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

interface SaleLineBody {
  productId: string;
  sizeCode?: string | null;
  qty: number;
  unitPrice: number;
  lineTotal?: number;
  name: string;
  sku?: string;
  imageUrl?: string | null;
}

interface SaleBody {
  warehouseId: string;
  customerName?: string | null;
  customerEmail?: string | null;
  paymentMethod: string;
  payments?: unknown;
  subtotal: number;
  discountPct?: number;
  discountAmt?: number;
  total: number;
  lines: SaleLineBody[];
  deliverySchedule?: unknown;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

/** GET /api/sales — list sales (warehouse_id required). pending=true = delivery sales not yet delivered; else from/to for history. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const h = corsHeaders(req);
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return withCors(auth, req);

  const scope = await getScopeForUser(auth.email);
  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get('warehouse_id')?.trim() ?? '';
  const pending = searchParams.get('pending') === 'true';
  const from = searchParams.get('from')?.trim() ?? '';
  const to = searchParams.get('to')?.trim() ?? '';
  const limit = Math.min(Number(searchParams.get('limit')) || 500, 2000);

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
    const db = getSupabase();
    let query = db
      .from('sales')
      .select(
        'id, warehouse_id, customer_name, payment_method, subtotal, discount_pct, discount_amt, total, receipt_id, status, sold_by_email, item_count, created_at, delivery_schedule, delivery_status, delivered_at'
      )
      .eq('warehouse_id', effectiveWarehouseId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (pending) {
      query = query.not('delivery_status', 'is', null).in('delivery_status', ['pending', 'dispatched', 'cancelled']);
    } else {
      if (from) query = query.gte('created_at', from);
      if (to) query = query.lte('created_at', to);
    }

    const { data: salesRows, error: salesError } = await query;

    if (salesError) {
      console.error('[GET /api/sales]', salesError.message);
      return withCors(
        NextResponse.json({ error: salesError.message ?? 'Failed to load sales' }, { status: 500, headers: h }),
        req
      );
    }

    const sales = (salesRows ?? []) as Array<Record<string, unknown>>;
    const saleIds = sales.map((s) => s.id as string).filter(Boolean);
    if (saleIds.length === 0) {
      return withCors(NextResponse.json(sales, { headers: h }), req);
    }

    const { data: linesRows } = await db
      .from('sale_lines')
      .select('sale_id, product_id, size_code, product_name, product_sku, unit_price, qty, line_total, product_image_url')
      .in('sale_id', saleIds);

    const linesBySale = (linesRows ?? []).reduce<Record<string, Array<Record<string, unknown>>>>((acc, row) => {
      const sid = (row as { sale_id: string }).sale_id;
      if (!acc[sid]) acc[sid] = [];
      acc[sid].push({
        id: (row as { id?: string }).id,
        productId: (row as { product_id: string }).product_id,
        sizeCode: (row as { size_code: string | null }).size_code,
        name: (row as { product_name: string }).product_name,
        sku: (row as { product_sku: string }).product_sku,
        unitPrice: (row as { unit_price: number }).unit_price,
        qty: (row as { qty: number }).qty,
        lineTotal: (row as { line_total: number }).line_total,
        imageUrl: (row as { product_image_url?: string | null }).product_image_url ?? null,
      });
      return acc;
    }, {});

    const list = sales.map((s) => {
      const id = s.id as string;
      const schedule = s.delivery_schedule as Record<string, unknown> | null | undefined;
      const sch = schedule && typeof schedule === 'object' ? schedule : {};
      return {
        id,
        receiptId: s.receipt_id,
        warehouseId: s.warehouse_id,
        customerName: s.customer_name ?? null,
        recipientName: (sch.recipientName as string) ?? (sch.recipient_name as string) ?? null,
        recipientPhone: (sch.recipientPhone as string) ?? (sch.recipient_phone as string) ?? null,
        deliveryAddress: (sch.deliveryAddress as string) ?? (sch.delivery_address as string) ?? null,
        deliveryNotes: (sch.deliveryNotes as string) ?? (sch.delivery_notes as string) ?? null,
        expectedDate: (sch.expectedDate as string) ?? (sch.expected_date as string) ?? null,
        paymentMethod: s.payment_method,
        subtotal: s.subtotal,
        discountPct: s.discount_pct,
        discountAmt: s.discount_amt,
        total: s.total,
        itemCount: s.item_count,
        status: s.status,
        createdAt: s.created_at,
        deliverySchedule: schedule ?? null,
        deliveryStatus: (s.delivery_status as string) ?? 'pending',
        deliveredAt: s.delivered_at ?? null,
        lines: linesBySale[id] ?? [],
      };
    });

    return withCors(NextResponse.json(list, { headers: h }), req);
  } catch (e) {
    console.error('[GET /api/sales]', e);
    return withCors(
      NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load sales' }, { status: 500, headers: h }),
      req
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const start = Date.now();
  const requestId = getRequestId(req);
  const h = corsHeaders(req);
  const fail = (status: number, message: string, code?: string): NextResponse => {
    logApiResponse(req, status, Date.now() - start, { message, code });
    return withCors(jsonError(status, message, { code, requestId, headers: h }), req);
  };

  try {
    if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return fail(500, 'Server misconfiguration. Missing Supabase env.');
    }

    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return withCors(auth, req);

    let body: SaleBody;
    try {
      body = await req.json();
    } catch {
      return fail(400, 'Invalid JSON body.');
    }

    const warehouseId = body?.warehouseId?.trim();
    if (!warehouseId) return fail(400, 'warehouseId is required.');

    const effectiveWarehouseId = await getEffectiveWarehouseId(auth, warehouseId);
    if (!effectiveWarehouseId) {
      return fail(403, 'You do not have access to this warehouse.');
    }

    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (lines.length === 0) return fail(422, 'At least one line item is required.');

    const subtotal = Number(body.subtotal);
    const total = Number(body.total);
    const discountPct = body.discountPct != null ? Number(body.discountPct) : 0;
    const discountAmt = body.discountAmt != null ? Number(body.discountAmt) : 0;
    const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod.trim() || 'cash' : 'cash';
    const customerName = body.customerName != null ? String(body.customerName).trim() || null : null;

    const rpcLines = lines.map((l: SaleLineBody) => ({
      productId: l.productId,
      sizeCode: l.sizeCode ?? null,
      qty: Math.max(1, Number(l.qty) || 1),
      unitPrice: Number(l.unitPrice) ?? 0,
      lineTotal: l.lineTotal != null ? Number(l.lineTotal) : (Number(l.unitPrice) || 0) * (Math.max(1, Number(l.qty) || 1)),
      name: typeof l.name === 'string' ? l.name : 'Unknown',
      sku: typeof l.sku === 'string' ? l.sku : '',
      imageUrl: l.imageUrl != null ? String(l.imageUrl).trim() || null : null,
    }));

    const hasDelivery = body.deliverySchedule != null && typeof body.deliverySchedule === 'object';
    const db = getSupabase();
    const { data, error } = await db.rpc('record_sale', {
      p_warehouse_id: effectiveWarehouseId,
      p_lines: rpcLines,
      p_subtotal: subtotal,
      p_discount_pct: discountPct,
      p_discount_amt: discountAmt,
      p_total: total,
      p_payment_method: paymentMethod,
      p_customer_name: customerName,
      p_sold_by: null,
      p_sold_by_email: auth.email ?? null,
      p_delivery_schedule: hasDelivery ? body.deliverySchedule : null,
    });

    if (error) {
      const msg = error.message ?? 'Sale failed';
      const code = error.code ?? '';
      if (code === 'P0001' || /INSUFFICIENT_STOCK|insufficient stock/i.test(msg)) {
        logApiResponse(req, 422, Date.now() - start, { message: msg, code });
        return withCors(
          jsonError(422, 'Insufficient stock for one or more items.', { code: 'INSUFFICIENT_STOCK', requestId, headers: h }),
          req
        );
      }
      console.error('[POST /api/sales] RPC error:', error.code, error.message);
      return fail(500, msg || 'Sale could not be recorded.');
    }

    if (!data || typeof data !== 'object') {
      return fail(500, 'Unexpected response from database.');
    }

    const result = data as { id?: string; receiptId?: string; total?: number; itemCount?: number; status?: string; createdAt?: string };
    const response = {
      id: result.id,
      receiptId: result.receiptId,
      total: result.total ?? total,
      itemCount: result.itemCount,
      status: result.status ?? 'completed',
      createdAt: result.createdAt ?? new Date().toISOString(),
    };

    logApiResponse(req, 200, Date.now() - start);
    return withCors(NextResponse.json(response, { status: 200, headers: h }), req);
  } catch (e) {
    console.error('[POST /api/sales] Unexpected error:', e);
    return fail(500, e instanceof Error ? e.message : 'Something went wrong.');
  }
}

/** PATCH /api/sales — update delivery status (dispatched | delivered | cancelled). Delivered = deduct reserved stock; cancelled = release reservations. */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const start = Date.now();
  const requestId = getRequestId(req);
  const h = corsHeaders(req);
  const fail = (status: number, message: string, code?: string): NextResponse => {
    logApiResponse(req, status, Date.now() - start, { message, code });
    return withCors(jsonError(status, message, { code, requestId, headers: h }), req);
  };

  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return withCors(auth, req);

    let body: { saleId?: string; deliveryStatus?: string; warehouseId?: string };
    try {
      body = await req.json();
    } catch {
      return fail(400, 'Invalid JSON body.');
    }

    const saleId = body?.saleId?.trim();
    const deliveryStatus = body?.deliveryStatus?.trim()?.toLowerCase();
    const warehouseId = body?.warehouseId?.trim();

    if (!saleId) return fail(400, 'saleId is required.');
    const validStatuses = ['dispatched', 'delivered', 'cancelled'];
    if (!deliveryStatus || !validStatuses.includes(deliveryStatus)) {
      return fail(400, 'deliveryStatus must be one of: dispatched, delivered, cancelled.');
    }

    const scope = await getScopeForUser(auth.email);
    const allowed = scope.allowedWarehouseIds;
    const isAdmin = /^(admin|super_admin)$/i.test(auth.role ?? '');

    const db = getSupabase();
    const { data: saleRow, error: fetchErr } = await db
      .from('sales')
      .select('id, warehouse_id, delivery_status')
      .eq('id', saleId)
      .maybeSingle();

    if (fetchErr) {
      console.error('[PATCH /api/sales] fetch', fetchErr);
      return fail(500, fetchErr.message ?? 'Failed to load sale.');
    }
    if (!saleRow) return fail(404, 'Sale not found.');

    const saleWarehouseId = (saleRow as { warehouse_id?: string }).warehouse_id ?? '';
    if (saleWarehouseId && !isAdmin && !allowed.includes(saleWarehouseId)) {
      return fail(403, 'You do not have access to this sale.');
    }
    if (warehouseId && saleWarehouseId && warehouseId !== saleWarehouseId) {
      return fail(400, 'Warehouse does not match sale.');
    }

    if (deliveryStatus === 'delivered') {
      const { error: rpcErr } = await db.rpc('complete_delivery', { p_sale_id: saleId });
      if (rpcErr) {
        console.error('[PATCH /api/sales] complete_delivery', rpcErr);
        return fail(500, rpcErr.message ?? 'Failed to mark as delivered.');
      }
    } else if (deliveryStatus === 'cancelled') {
      const { error: rpcErr } = await db.rpc('release_delivery_reservations', { p_sale_id: saleId });
      if (rpcErr) {
        console.error('[PATCH /api/sales] release_delivery_reservations', rpcErr);
        return fail(500, rpcErr.message ?? 'Failed to cancel delivery.');
      }
    } else {
      const { error: updateErr } = await db
        .from('sales')
        .update({ delivery_status: 'dispatched' })
        .eq('id', saleId)
        .in('delivery_status', ['pending', null]);
      if (updateErr) {
        console.error('[PATCH /api/sales] update dispatched', updateErr);
        return fail(500, updateErr.message ?? 'Failed to update status.');
      }
    }

    logApiResponse(req, 200, Date.now() - start);
    return withCors(
      NextResponse.json({ ok: true, deliveryStatus }, { status: 200, headers: h }),
      req
    );
  } catch (e) {
    console.error('[PATCH /api/sales]', e);
    return fail(500, e instanceof Error ? e.message : 'Something went wrong.');
  }
}
