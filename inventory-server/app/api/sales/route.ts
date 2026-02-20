// ============================================================
// route.ts
// File: inventory-server/app/api/sales/route.ts
//
// POST /api/sales
//   Body: SalePayload (lines, totals, payment, customer, warehouseId)
//   Returns: { id, receiptId, ...saleData }
//
// GET /api/sales
//   Query: warehouse_id, limit, offset, from, to
//   Returns: paginated sales with lines
//
// Calls the record_sale Supabase RPC which atomically:
//   1. Inserts into sales
//   2. Inserts all sale_lines
//   3. Deducts stock from warehouse_inventory(_by_size)
//   All in a single DB transaction — if any step fails, all roll back.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '../../../lib/supabase';
import { verifyAuth } from '../../../lib/auth';

// ── CORS headers (same as other routes in this project) ───────────────────

const CORS = {
  'Access-Control-Allow-Origin':
    process.env.ALLOWED_ORIGIN ?? 'https://warehouse.extremedeptkidz.com',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, Idempotency-Key, x-request-id',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// ── POST /api/sales ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth check
  const authResult = await verifyAuth(req);
  if (!authResult.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS });
  }

  // ── Validate required fields ───────────────────────────────────────────

  const warehouseId    = (body.warehouseId as string)?.trim();
  const paymentMethod  = (body.paymentMethod as string)?.trim();
  const lines          = body.lines as Array<Record<string, unknown>> | undefined;
  const subtotal       = Number(body.subtotal ?? 0);
  const discountPct   = Number(body.discountPct ?? 0);
  const discountAmt   = Number(body.discountAmt ?? 0);
  const total          = Number(body.total ?? 0);
  const customerName   = (body.customerName as string | null) ?? null;
  const soldBy         = authResult.user?.email ?? null;

  if (!warehouseId) {
    return NextResponse.json({ error: 'warehouseId is required' }, { status: 400, headers: CORS });
  }
  if (!['Cash', 'MoMo', 'Card'].includes(paymentMethod)) {
    return NextResponse.json(
      { error: 'paymentMethod must be Cash, MoMo, or Card' },
      { status: 400, headers: CORS }
    );
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: 'lines must be a non-empty array' }, { status: 400, headers: CORS });
  }

  // Normalize lines
  let normalizedLines: Array<{ productId: string; sizeCode: string | null; qty: number; unitPrice: number; lineTotal: number; name: string; sku: string }>;
  try {
    normalizedLines = lines.map((l, i) => {
      const productId = (l.productId as string)?.trim();
      const qty       = Math.floor(Number(l.qty ?? 0));
      const unitPrice = Number(l.unitPrice ?? 0);
      const lineTotal = Number(l.lineTotal ?? unitPrice * qty);
      const sizeCode  = (l.sizeCode as string | null)?.trim() || null;
      const name      = (l.name as string) ?? 'Unknown';
      const sku       = (l.sku as string) ?? '';

      if (!productId) throw Object.assign(new Error(`lines[${i}].productId is required`), { status: 400 });
      if (qty <= 0)   throw Object.assign(new Error(`lines[${i}].qty must be > 0`),       { status: 400 });

      return { productId, sizeCode, qty, unitPrice, lineTotal, name, sku };
    });
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error('Invalid line');
    const status = (err as { status?: number })?.status ?? 400;
    return NextResponse.json({ error: e.message }, { status, headers: CORS });
  }

  const supabase = getSupabase();

  // ── Call record_sale RPC ───────────────────────────────────────────────
  // This single call does everything atomically in Postgres:
  //   insert sale → insert lines → deduct stock
  //
  // If the /api/sales endpoint is called multiple times with the same
  // Idempotency-Key header, only the first call is processed.
  // (Idempotency is enforced at the API gateway level, not here.)

  try {
    const { data, error } = await supabase.rpc('record_sale', {
      p_warehouse_id:   warehouseId,
      p_lines:          normalizedLines,
      p_subtotal:       subtotal,
      p_discount_pct:   discountPct,
      p_discount_amt:   discountAmt,
      p_total:          total,
      p_payment_method: paymentMethod,
      p_customer_name:  customerName,
      p_sold_by:        soldBy,
    });

    if (error) {
      console.error('[POST /api/sales] RPC error:', error);
      return NextResponse.json(
        { error: error.message ?? 'Failed to record sale' },
        { status: 500, headers: CORS }
      );
    }

    return NextResponse.json(data, { status: 201, headers: CORS });

  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error('Internal server error');
    console.error('[POST /api/sales] Unexpected error:', err);
    return NextResponse.json(
      { error: err.message ?? 'Internal server error' },
      { status: 500, headers: CORS }
    );
  }
}

// ── GET /api/sales ────────────────────────────────────────────────────────
// Returns paginated sales with their lines. Used by the sales history page.

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (!authResult.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
  }

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get('warehouse_id') ?? '';
  const limit  = Math.min(Number(searchParams.get('limit')  ?? 50), 200);
  const offset = Number(searchParams.get('offset') ?? 0);
  const from   = searchParams.get('from');   // ISO date string
  const to     = searchParams.get('to');     // ISO date string

  const supabase = getSupabase();

  let query = supabase
    .from('sales')
    .select(
      `
      id, receipt_id, warehouse_id, customer_name,
      payment_method, subtotal, discount_pct, discount_amt,
      total, item_count, sold_by, created_at,
      sale_lines (
        id, product_id, size_code, product_name, product_sku,
        unit_price, qty, line_total, created_at
      )
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (warehouseId) query = query.eq('warehouse_id', warehouseId);
  if (from)        query = query.gte('created_at', from);
  if (to)          query = query.lte('created_at', to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  }

  // Camel-case the response to match frontend conventions
  const sales = (data ?? []).map(s => ({
    id:            s.id,
    receiptId:     s.receipt_id,
    warehouseId:   s.warehouse_id,
    customerName:  s.customer_name,
    paymentMethod: s.payment_method,
    subtotal:      Number(s.subtotal),
    discountPct:   Number(s.discount_pct),
    discountAmt:   Number(s.discount_amt),
    total:         Number(s.total),
    itemCount:     s.item_count,
    soldBy:        s.sold_by,
    createdAt:     s.created_at,
    lines:         (s.sale_lines as Array<Record<string, unknown>>).map(l => ({
      id:          l.id,
      productId:   l.product_id,
      sizeCode:    l.size_code,
      name:        l.product_name,
      sku:         l.product_sku,
      unitPrice:   Number(l.unit_price),
      qty:         l.qty,
      lineTotal:   Number(l.line_total),
    })),
  }));

  return NextResponse.json({ data: sales, total: count ?? sales.length }, { headers: CORS });
}
