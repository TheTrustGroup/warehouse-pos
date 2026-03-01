// ============================================================
// route.ts  →  inventory-server/app/api/sales/route.ts
//
// POST /api/sales  — record completed sale + deduct stock
// GET  /api/sales  — list completed sales with line items
//
// FIXES IN THIS VERSION:
//   1. POST: p_lines passed as jsonb array (not stringified) → RPC deducts correctly
//   2. POST: status='completed' explicitly in manual fallback
//   3. GET: filter in JS not SQL (works even if status column missing in old DB)
//   4. GET: product_image_url in sale_lines for receipt display
//   5. Uses getSupabase() + corsHeaders(req); paymentMethod normalized (cash/card/mobile_money → Cash/Card/MoMo).
//   6. Session auth: requirePosRole (POST), requireAuth (GET); warehouse scope via getScopeForUser / getEffectiveWarehouseId.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { corsHeaders } from '@/lib/cors';
import { requireAuth, requirePosRole, getEffectiveWarehouseId } from '@/lib/auth/session';
import { getScopeForUser } from '@/lib/data/userScopes';
import { getCachedResponse, setCachedResponse } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  const h = corsHeaders(req);
  Object.entries(h).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

/** Allowed DB values; frontend may send cash, card, mobile_money, mixed. */
const PAYMENT_MAP: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  momo: 'MoMo',
  mobile_money: 'MoMo',
  mobilemoney: 'MoMo',
  mixed: 'Cash',
};
const ALLOWED_PAYMENT = new Set(['Cash', 'MoMo', 'Card']);

function normalizePaymentMethod(raw: string): string {
  const normalized = PAYMENT_MAP[raw.toLowerCase().trim()] ?? raw.trim();
  return ALLOWED_PAYMENT.has(normalized) ? normalized : 'Cash';
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

// ── PATCH /api/sales ──────────────────────────────────────────────────────
/** Update delivery status. Body: { saleId, deliveryStatus, warehouseId }. deliveryStatus: pending | dispatched | delivered | cancelled */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return withCors(auth, req);

  const h = corsHeaders(req);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: h });
  }

  const saleId = String(body.saleId ?? body.sale_id ?? '').trim();
  const deliveryStatus = String(body.deliveryStatus ?? body.delivery_status ?? '').trim().toLowerCase();
  const bodyWarehouseId = String(body.warehouseId ?? body.warehouse_id ?? '').trim();

  if (!saleId || !deliveryStatus) {
    return NextResponse.json({ error: 'saleId and deliveryStatus are required' }, { status: 400, headers: h });
  }
  const allowed = ['pending', 'dispatched', 'delivered', 'cancelled'];
  if (!allowed.includes(deliveryStatus)) {
    return NextResponse.json({ error: `deliveryStatus must be one of: ${allowed.join(', ')}` }, { status: 400, headers: h });
  }

  const scope = await getScopeForUser(auth.email);
  const effectiveWarehouseId = bodyWarehouseId && (scope.allowedWarehouseIds.length === 0 || scope.allowedWarehouseIds.includes(bodyWarehouseId))
    ? bodyWarehouseId
    : scope.allowedWarehouseIds[0];
  if (!effectiveWarehouseId) {
    return NextResponse.json({ error: 'warehouseId required and must be in your scope' }, { status: 400, headers: h });
  }

  try {
    const db = getSupabase();
    const updates: Record<string, unknown> = {
      delivery_status: deliveryStatus,
    };
    if (deliveryStatus === 'delivered') {
      updates.delivered_at = new Date().toISOString();
      updates.delivered_by = auth.email ?? null;
    }

    const { error } = await db
      .from('sales')
      .update(updates)
      .eq('id', saleId)
      .eq('warehouse_id', effectiveWarehouseId);

    if (error) {
      if (error.message?.includes('delivery_status') || error.message?.includes('column')) {
        return NextResponse.json(
          { error: 'Delivery columns missing. Run DELIVERY_MIGRATION.sql and ADD_DELIVERY_CANCELLED.sql in Supabase.' },
          { status: 500, headers: h }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500, headers: h });
    }
    return NextResponse.json({ success: true, saleId, deliveryStatus }, { headers: h });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500, headers: h });
  }
}

// ── POST /api/sales ───────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requirePosRole(req);
  if (auth instanceof NextResponse) return withCors(auth, req);

  const h = corsHeaders(req);
  const idempotencyKey = req.headers.get('idempotency-key')?.trim() ?? undefined;
  if (idempotencyKey) {
    const cached = getCachedResponse(idempotencyKey);
    if (cached) {
      return withCors(NextResponse.json(cached, { status: 200, headers: h }), req);
    }
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return withCors(NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: h }), req); }

  const bodyWarehouseId = String(body.warehouseId ?? '').trim() || undefined;
  const effectiveWarehouseId = await getEffectiveWarehouseId(auth, bodyWarehouseId, {
    path: req.nextUrl.pathname,
    method: 'POST',
  });
  if (!effectiveWarehouseId) {
    return withCors(
      NextResponse.json(
        { error: 'warehouseId is required and must be in your scope' },
        { status: 400, headers: h }
      ),
      req
    );
  }

  const warehouseId   = effectiveWarehouseId;
  const paymentMethod = normalizePaymentMethod(String(body.paymentMethod ?? ''));
  const lines         = body.lines as Array<Record<string, unknown>> | undefined;
  const subtotal      = Number(body.subtotal    ?? 0);
  const discountPct   = Number(body.discountPct ?? 0);
  const discountAmt   = Number(body.discountAmt ?? 0);
  const total         = Number(body.total       ?? subtotal - discountAmt);
  const customerName  = String(body.customerName ?? '').trim() || null;

  if (!Array.isArray(lines) || lines.length === 0)
    return withCors(NextResponse.json({ error: 'lines must be non-empty' }, { status: 400, headers: h }), req);

  type NormalizedLine = {
    productId: string; sizeCode: string | null; qty: number;
    unitPrice: number; lineTotal: number; name: string; sku: string;
    imageUrl: string | null;
  };

  let normalizedLines: NormalizedLine[];
  try {
    normalizedLines = lines.map((l, i) => {
      const productId = String(l.productId ?? '').trim();
      if (!productId) throw new Error(`lines[${i}].productId missing`);
      return {
        productId,
        sizeCode:  String(l.sizeCode  ?? '').trim().toUpperCase() || null,
        qty:       Math.max(1, Math.floor(Number(l.qty ?? 1))),
        unitPrice: Number(l.unitPrice ?? 0),
        lineTotal: Number(l.lineTotal ?? Number(l.unitPrice ?? 0) * Math.max(1, Number(l.qty ?? 1))),
        name:      String(l.name ?? 'Product'),
        sku:       String(l.sku  ?? ''),
        imageUrl:  String(l.imageUrl ?? '').trim() || null,
      };
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Invalid lines';
    return withCors(NextResponse.json({ error: message }, { status: 400, headers: h }), req);
  }

  try {
    const db = getSupabase();

    // KEY FIX: Pass normalizedLines as a JS array — Supabase RPC auto-casts to jsonb.
    // Do NOT JSON.stringify — that sends a string, not jsonb, causing silent insert-only (no deduction).
    const { data, error } = await db.rpc('record_sale', {
      p_warehouse_id:   warehouseId,
      p_lines:          normalizedLines,  // ← JS array → jsonb (NOT string)
      p_subtotal:       subtotal,
      p_discount_pct:   discountPct,
      p_discount_amt:   discountAmt,
      p_total:          total,
      p_payment_method: paymentMethod,
      p_customer_name:  customerName,
      p_sold_by:        null,
    });

    if (error) {
      console.error('[POST /api/sales] RPC error:', error.code, error.message);
      if (error.code === '42883' || error.message?.includes('does not exist')) {
        return withCors(await manualSaleFallback({ db, warehouseId, normalizedLines, subtotal, discountPct, discountAmt, total, paymentMethod, customerName, headers: h, idempotencyKey }), req);
      }
      return withCors(NextResponse.json({ error: error.message }, { status: 500, headers: h }), req);
    }

    const result = typeof data === 'string' ? JSON.parse(data) : (data ?? {});
    const responseBody = {
      id:        result.id ?? result.saleId,
      receiptId: result.receiptId ?? result.receipt_id,
      total,
      itemCount: normalizedLines.reduce((s, l) => s + l.qty, 0),
      status:    'completed',
      createdAt: result.createdAt ?? new Date().toISOString(),
    };
    if (idempotencyKey) setCachedResponse(idempotencyKey, responseBody);
    return withCors(NextResponse.json(responseBody, { status: 201, headers: h }), req);

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error';
    console.error('[POST /api/sales] exception:', message);
    return withCors(NextResponse.json({ error: message }, { status: 500, headers: h }), req);
  }
}

// ── Manual fallback ───────────────────────────────────────────────────────
async function manualSaleFallback(args: {
  db: ReturnType<typeof getSupabase>; warehouseId: string;
  normalizedLines: Array<{ productId: string; sizeCode: string | null; qty: number; unitPrice: number; lineTotal: number; name: string; sku: string; imageUrl: string | null }>;
  subtotal: number; discountPct: number; discountAmt: number; total: number;
  paymentMethod: string; customerName: string | null;
  headers: Record<string, string>;
  idempotencyKey?: string;
}): Promise<NextResponse> {
  const { db, warehouseId, normalizedLines, subtotal, discountPct, discountAmt, total, paymentMethod, customerName, headers, idempotencyKey } = args;
  const { randomUUID } = await import('crypto');
  const saleId = randomUUID();
  const ts = new Date();
  const receiptId = `RCP-${ts.toISOString().slice(0,10).replace(/-/g,'')}-${String(Math.floor(1000 + Math.random() * 9000))}`;
  const now = ts.toISOString();
  const itemCount = normalizedLines.reduce((s, l) => s + l.qty, 0);

  const { error: saleErr } = await db.from('sales').insert({
    id: saleId, warehouse_id: warehouseId, customer_name: customerName,
    payment_method: paymentMethod, subtotal, discount_pct: discountPct,
    discount_amt: discountAmt, total, item_count: itemCount,
    receipt_id: receiptId, status: 'completed', created_at: now,
  });
  if (saleErr) return NextResponse.json({ error: saleErr.message }, { status: 500, headers });

  for (const line of normalizedLines) {
    await db.from('sale_lines').insert({
      id: randomUUID(), sale_id: saleId,
      product_id: line.productId, size_code: line.sizeCode,
      product_name: line.name, product_sku: line.sku,
      unit_price: line.unitPrice, qty: line.qty, line_total: line.lineTotal,
      product_image_url: line.imageUrl, created_at: now,
    }).then(r => { if (r.error) console.warn('[manualFallback] line insert:', r.error.message); });

    const { data: prod } = await db.from('warehouse_products')
      .select('size_kind').eq('id', line.productId).maybeSingle();
    const sizeKind = prod?.size_kind ?? 'na';

    if (sizeKind === 'sized' && line.sizeCode) {
      const { data: sr } = await db.from('warehouse_inventory_by_size')
        .select('quantity').eq('warehouse_id', warehouseId).eq('product_id', line.productId)
        .ilike('size_code', line.sizeCode).maybeSingle();
      if (sr != null) {
        await db.from('warehouse_inventory_by_size')
          .update({ quantity: Math.max(0, sr.quantity - line.qty), updated_at: now })
          .eq('warehouse_id', warehouseId).eq('product_id', line.productId).ilike('size_code', line.sizeCode);
      }
      const { data: allSizes } = await db.from('warehouse_inventory_by_size')
        .select('quantity').eq('warehouse_id', warehouseId).eq('product_id', line.productId);
      const newTotal = (allSizes ?? []).reduce((s: number, r: { quantity?: number }) => s + (r.quantity ?? 0), 0);
      await db.from('warehouse_inventory')
        .update({ quantity: newTotal, updated_at: now }).eq('warehouse_id', warehouseId).eq('product_id', line.productId);
    } else {
      const { data: inv } = await db.from('warehouse_inventory')
        .select('quantity').eq('warehouse_id', warehouseId).eq('product_id', line.productId).maybeSingle();
      if (inv != null) {
        await db.from('warehouse_inventory')
          .update({ quantity: Math.max(0, inv.quantity - line.qty), updated_at: now })
          .eq('warehouse_id', warehouseId).eq('product_id', line.productId);
      }
    }
  }

  const responseBody = { id: saleId, receiptId, total, itemCount, status: 'completed', createdAt: now };
  if (idempotencyKey) setCachedResponse(idempotencyKey, responseBody);
  return NextResponse.json(responseBody, { status: 201, headers });
}

// ── GET /api/sales ────────────────────────────────────────────────────────
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return withCors(auth, req);

  const h = corsHeaders(req);
  const { searchParams } = new URL(req.url);
  const queryWarehouseId = searchParams.get('warehouse_id')?.trim() ?? '';
  const scope = await getScopeForUser(auth.email);
  const allowed = scope.allowedWarehouseIds;
  const isAdminNoScope = auth.role === 'admin' && allowed.length === 0;
  const warehouseId = queryWarehouseId
    ? (isAdminNoScope ? queryWarehouseId : (allowed.includes(queryWarehouseId) ? queryWarehouseId : ''))
    : (allowed[0] ?? '');
  if (!warehouseId) {
    return NextResponse.json(
      { error: allowed.length ? 'warehouse_id required or must be in your scope' : 'No warehouse access' },
      { status: 400, headers: h }
    );
  }

  const date        = searchParams.get('date');
  const from        = searchParams.get('from') ?? (date ? `${date}T00:00:00.000Z` : undefined);
  const to          = searchParams.get('to')   ?? (date ? `${date}T23:59:59.999Z` : undefined);
  const limit       = Math.min(Number(searchParams.get('limit') ?? 100), 500);
  const offset      = Number(searchParams.get('offset') ?? 0);
  const pending     = searchParams.get('pending') === 'true' || searchParams.get('pending') === '1';

  try {
    const db = getSupabase();

    // Deliveries page: pending=true → return sales with delivery_status in (pending, dispatched, cancelled) and delivery fields
    if (pending) {
      const deliveryQuery = db
        .from('sales')
        .select(`
          id, receipt_id, warehouse_id, customer_name,
          payment_method, subtotal, discount_pct, discount_amt,
          total, item_count, sold_by, status, created_at,
          delivery_status, recipient_name, recipient_phone,
          delivery_address, delivery_notes, expected_date,
          delivered_at, delivered_by,
          sale_lines (
            id, product_id, size_code, product_name, product_sku,
            unit_price, qty, line_total, product_image_url
          )
        `)
        .eq('warehouse_id', warehouseId)
        .in('delivery_status', ['pending', 'dispatched', 'cancelled'])
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      const { data: pendingData, error: pendingErr } = await deliveryQuery;
      if (pendingErr) {
        if (pendingErr.message?.includes('delivery_status') || pendingErr.message?.includes('column')) {
          return NextResponse.json(
            { error: 'Delivery columns missing. Run DELIVERY_MIGRATION.sql and ADD_DELIVERY_CANCELLED.sql in Supabase.' },
            { status: 500, headers: h }
          );
        }
        return NextResponse.json({ error: pendingErr.message }, { status: 500, headers: h });
      }
      const list = (pendingData ?? []).filter((s: { status?: string }) => !s.status || s.status === 'completed');
      return NextResponse.json({ data: shapeSalesWithDelivery(list), total: list.length }, { headers: h });
    }

    let query = db
      .from('sales')
      .select(`
        id, receipt_id, warehouse_id, customer_name,
        payment_method, subtotal, discount_pct, discount_amt,
        total, item_count, sold_by, status, created_at, voided_at,
        sale_lines (
          id, product_id, size_code, product_name, product_sku,
          unit_price, qty, line_total, product_image_url
        )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (warehouseId) query = query.eq('warehouse_id', warehouseId);
    if (from)        query = query.gte('created_at', from);
    if (to)          query = query.lte('created_at', to);

    const { data, error } = await query;
    if (error) {
      if (error.message?.includes('product_image_url') || error.message?.includes('status')) {
        return getSalesLegacy(db, warehouseId, from, to, limit, offset, h);
      }
      return NextResponse.json({ error: error.message }, { status: 500, headers: h });
    }

    const completed = (data ?? []).filter((s: { status?: string }) =>
      !s.status || s.status === 'completed'
    );

    return NextResponse.json({ data: shapeSales(completed), total: completed.length }, { headers: h });

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500, headers: h });
  }
}

async function getSalesLegacy(
  db: ReturnType<typeof getSupabase>, warehouseId: string,
  from: string | undefined, to: string | undefined, limit: number, offset: number,
  headers: Record<string, string>
): Promise<NextResponse> {
  let q = db.from('sales')
    .select(`id, receipt_id, warehouse_id, customer_name, payment_method,
             subtotal, discount_pct, discount_amt, total, item_count, sold_by, created_at,
             sale_lines(id, product_id, size_code, product_name, product_sku, unit_price, qty, line_total)`)
    .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (warehouseId) q = q.eq('warehouse_id', warehouseId);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers });
  return NextResponse.json({ data: shapeSales(data ?? []), total: data?.length ?? 0 }, { headers });
}

function shapeSales(rows: Array<Record<string, unknown>>) {
  return rows.map((s: Record<string, unknown>) => ({
    id: s.id, receiptId: s.receipt_id, warehouseId: s.warehouse_id,
    customerName: s.customer_name, paymentMethod: s.payment_method,
    subtotal:  Number(s.subtotal    ?? 0), discountPct: Number(s.discount_pct ?? 0),
    discountAmt: Number(s.discount_amt ?? 0), total: Number(s.total ?? 0),
    itemCount: s.item_count, status: (s.status as string) ?? 'completed',
    soldBy: s.sold_by, createdAt: s.created_at,
    voidedAt: (s.voided_at as string | null) ?? null,
    lines: ((s.sale_lines as Array<Record<string, unknown>>) ?? []).map((l: Record<string, unknown>) => ({
      id: l.id, productId: l.product_id, sizeCode: l.size_code,
      name: l.product_name, sku: l.product_sku,
      unitPrice: Number(l.unit_price ?? 0), qty: l.qty,
      lineTotal: Number(l.line_total ?? 0),
      imageUrl: (l.product_image_url as string | null) ?? null,
    })),
  }));
}

function shapeSalesWithDelivery(rows: Array<Record<string, unknown>>) {
  return rows.map((s: Record<string, unknown>) => ({
    id: s.id, receiptId: s.receipt_id, warehouseId: s.warehouse_id,
    customerName: s.customer_name, paymentMethod: s.payment_method,
    subtotal:  Number(s.subtotal ?? 0), discountPct: Number(s.discount_pct ?? 0),
    discountAmt: Number(s.discount_amt ?? 0), total: Number(s.total ?? 0),
    itemCount: s.item_count, soldBy: s.sold_by, createdAt: s.created_at,
    deliveryStatus: (s.delivery_status as string) ?? 'pending',
    recipientName: (s.recipient_name as string | null) ?? null,
    recipientPhone: (s.recipient_phone as string | null) ?? null,
    deliveryAddress: (s.delivery_address as string | null) ?? null,
    deliveryNotes: (s.delivery_notes as string | null) ?? null,
    expectedDate: (s.expected_date as string | null) ?? null,
    deliveredAt: (s.delivered_at as string | null) ?? null,
    lines: ((s.sale_lines as Array<Record<string, unknown>>) ?? []).map((l: Record<string, unknown>) => ({
      id: l.id, productId: l.product_id, sizeCode: l.size_code,
      name: l.product_name, sku: l.product_sku,
      unitPrice: Number(l.unit_price ?? 0), qty: l.qty,
      lineTotal: Number(l.line_total ?? 0),
      imageUrl: (l.product_image_url as string | null) ?? null,
    })),
  }));
}
