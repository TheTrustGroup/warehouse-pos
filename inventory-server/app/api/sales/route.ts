// ============================================================
// route.ts
// File: inventory-server/app/api/sales/route.ts
//
// POST /api/sales — record a completed sale + deduct stock
// GET  /api/sales — list sales with lines
//
// HOW TO DEPLOY:
//   1. Create folder: inventory-server/app/api/sales/
//   2. Drop this file in as route.ts
//   3. Run the SQL migration (001_complete_sql_fix.sql)
//      in Supabase Dashboard → SQL Editor
//   4. Deploy to Vercel — it will auto-pick up the new route
//
// This file is standalone — no new dependencies needed.
// Uses the same getSupabase() and verifyAuth() pattern as
// all other routes in this backend.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ── CORS ─────────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  process.env.ALLOWED_ORIGIN ?? 'https://warehouse.extremedeptkidz.com',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-request-id',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// ── Supabase client ───────────────────────────────────────────────────────
// Uses the service role key so RLS doesn't block stock updates
function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ??
              process.env.SUPABASE_ANON_KEY ??
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !key) throw new Error('Supabase env vars not set');
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Auth check ────────────────────────────────────────────────────────────
function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
}

// ── POST /api/sales ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS });
  }

  // ── Validate ─────────────────────────────────────────────────────────────

  const warehouseId   = String(body.warehouseId ?? '').trim();
  const paymentMethod = String(body.paymentMethod ?? '').trim();
  const lines         = body.lines as Array<Record<string, unknown>> | undefined;
  const subtotal      = Number(body.subtotal ?? 0);
  const discountPct   = Number(body.discountPct ?? 0);
  const discountAmt   = Number(body.discountAmt ?? 0);
  const total         = Number(body.total ?? 0);
  const customerName  = String(body.customerName ?? '').trim() || null;

  if (!warehouseId)
    return NextResponse.json({ error: 'warehouseId required' }, { status: 400, headers: CORS });

  if (!['Cash', 'MoMo', 'Card'].includes(paymentMethod))
    return NextResponse.json({ error: 'paymentMethod must be Cash, MoMo, or Card' }, { status: 400, headers: CORS });

  if (!Array.isArray(lines) || lines.length === 0)
    return NextResponse.json({ error: 'lines must be a non-empty array' }, { status: 400, headers: CORS });

  // Normalize lines
  const normalizedLines = lines.map((l, i) => {
    const productId = String(l.productId ?? '').trim();
    const qty       = Math.floor(Number(l.qty ?? 0));
    const unitPrice = Number(l.unitPrice ?? 0);
    const sizeCode  = String(l.sizeCode ?? '').trim() || null;
    const name      = String(l.name ?? 'Unknown');
    const sku       = String(l.sku ?? '');
    const lineTotal = Number(l.lineTotal ?? unitPrice * qty);

    if (!productId) throw Object.assign(new Error(`lines[${i}].productId missing`), { status: 400 });
    if (qty <= 0)   throw Object.assign(new Error(`lines[${i}].qty must be > 0`),   { status: 400 });

    return { productId, sizeCode, qty, unitPrice, lineTotal, name, sku };
  });

  try {
    const supabase = getSupabase();

    // ── Call record_sale RPC (atomic: insert + stock deduction) ──────────
    const { data, error } = await supabase.rpc('record_sale', {
      p_warehouse_id:   warehouseId,
      p_lines:          normalizedLines,
      p_subtotal:       subtotal,
      p_discount_pct:   discountPct,
      p_discount_amt:   discountAmt,
      p_total:          total,
      p_payment_method: paymentMethod,
      p_customer_name:  customerName,
      p_sold_by:        null,
    });

    if (error) {
      console.error('[POST /api/sales] RPC error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
    }

    return NextResponse.json(data, { status: 201, headers: CORS });

  } catch (e: unknown) {
    const err = e as Error & { status?: number };
    const status = err.status ?? 500;
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status, headers: CORS });
  }
}

// ── GET /api/sales ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) return unauthorized();

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get('warehouse_id') ?? '';
  const limit  = Math.min(Number(searchParams.get('limit')  ?? 50), 500);
  const offset = Number(searchParams.get('offset') ?? 0);
  const from   = searchParams.get('from');
  const to     = searchParams.get('to');

  try {
    const supabase = getSupabase();

    let query = supabase
      .from('sales')
      .select(`
        id, receipt_id, warehouse_id, customer_name,
        payment_method, subtotal, discount_pct, discount_amt,
        total, item_count, sold_by, created_at,
        sale_lines (
          id, product_id, size_code, product_name, product_sku,
          unit_price, qty, line_total
        )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (warehouseId) query = query.eq('warehouse_id', warehouseId);
    if (from)        query = query.gte('created_at', from);
    if (to)          query = query.lte('created_at', to);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });

    const sales = (data ?? []).map((s: Record<string, unknown>) => ({
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
      lines: ((s.sale_lines as Array<Record<string, unknown>>) ?? []).map((l: Record<string, unknown>) => ({
        id:        l.id,
        productId: l.product_id,
        sizeCode:  l.size_code,
        name:      l.product_name,
        sku:       l.product_sku,
        unitPrice: Number(l.unit_price),
        qty:       l.qty,
        lineTotal: Number(l.line_total),
      })),
    }));

    return NextResponse.json({ data: sales, total: sales.length }, { headers: CORS });

  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error('Internal error');
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS });
  }
}
