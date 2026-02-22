/**
 * GET /api/sales — list sales (e.g. for dashboard "Today's Sales").
 * POST /api/sales — record a sale via record_sale() RPC (inserts sale + sale_lines, deducts stock).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePosRole, getEffectiveWarehouseId } from '@/lib/auth/session';
import { getSupabase } from '@/lib/supabase';
import { getScopeForUser } from '@/lib/data/userScopes';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const warehouseId = searchParams.get('warehouse_id') ?? undefined;
  const date = searchParams.get('date') ?? undefined;
  const limitParam = searchParams.get('limit');
  const limit = limitParam != null ? Math.min(5000, Math.max(0, parseInt(limitParam, 10))) : 500;
  void date;
  void limit;

  if (!warehouseId) {
    return NextResponse.json(
      { error: 'warehouse_id is required' },
      { status: 400 }
    );
  }

  const scope = await getScopeForUser(auth.email);
  if (scope.allowedWarehouseIds.length > 0 && !scope.allowedWarehouseIds.includes(warehouseId)) {
    return NextResponse.json({ error: 'Forbidden: warehouse not in scope' }, { status: 403 });
  }

  const supabase = getSupabase();
  let query = supabase
    .from('sales')
    .select('id, warehouse_id, receipt_id, customer_name, payment_method, subtotal, discount_pct, discount_amt, total, created_at')
    .eq('warehouse_id', warehouseId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (date) {
    query = query.gte('created_at', `${date}T00:00:00.000Z`).lt('created_at', `${date}T23:59:59.999Z`);
  }
  const { data, error } = await query;
  if (error) {
    console.error('[api/sales GET]', error);
    return NextResponse.json({ message: error.message ?? 'Failed to list sales' }, { status: 500 });
  }
  const list = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    warehouseId: row.warehouse_id,
    receiptId: row.receipt_id,
    customerName: row.customer_name,
    paymentMethod: row.payment_method,
    subtotal: row.subtotal,
    discountPct: row.discount_pct,
    discountAmt: row.discount_amt,
    total: row.total,
    createdAt: row.created_at,
  }));
  return NextResponse.json({ data: list, total: list.length });
}

interface SaleLinePayload {
  productId: string;
  sizeCode: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  name: string;
  sku: string;
}

export async function POST(request: NextRequest) {
  const auth = requirePosRole(request);
  if (auth instanceof NextResponse) return auth;

  let body: {
    warehouseId?: string;
    customerName?: string | null;
    paymentMethod?: string;
    subtotal?: number;
    discountPct?: number;
    discountAmt?: number;
    total?: number;
    lines?: SaleLinePayload[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const warehouseId = getEffectiveWarehouseId(auth, body.warehouseId, {
    path: '/api/sales',
    method: 'POST',
  });
  if (!warehouseId) {
    return NextResponse.json({ message: 'warehouse_id is required' }, { status: 400 });
  }

  const scope = await getScopeForUser(auth.email);
  if (scope.allowedWarehouseIds.length > 0 && !scope.allowedWarehouseIds.includes(warehouseId)) {
    return NextResponse.json({ error: 'Forbidden: warehouse not in scope' }, { status: 403 });
  }

  const paymentMethod = (body.paymentMethod ?? 'cash').trim() || 'cash';
  const subtotal = Number(body.subtotal ?? 0);
  const discountPct = Number(body.discountPct ?? 0);
  const discountAmt = Number(body.discountAmt ?? 0);
  const total = Number(body.total ?? 0);
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length === 0) {
    return NextResponse.json({ message: 'At least one line is required' }, { status: 400 });
  }

  const pLines = lines.map((l) => ({
    product_id: l.productId,
    size_code: l.sizeCode ?? null,
    qty: l.qty,
    unit_price: l.unitPrice,
    line_total: l.lineTotal,
    name: l.name ?? '',
    sku: l.sku ?? '',
  }));

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('record_sale', {
      p_warehouse_id: warehouseId,
      p_customer_name: body.customerName ?? null,
      p_payment_method: paymentMethod,
      p_subtotal: subtotal,
      p_discount_pct: discountPct,
      p_discount_amt: discountAmt,
      p_total: total,
      p_lines: pLines,
    });
    if (error) throw error;
    const result = data as {
      id?: string;
      receiptId?: string;
      receipt_id?: string;
      createdAt?: string;
      created_at?: string;
    } | null;
    if (!result) {
      return NextResponse.json({ message: 'record_sale returned no data' }, { status: 500 });
    }
    return NextResponse.json({
      id: result.id,
      receiptId: result.receiptId ?? result.receipt_id,
      createdAt: result.createdAt ?? result.created_at ?? new Date().toISOString(),
    });
  } catch (e) {
    console.error('[api/sales POST]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to record sale' },
      { status: 500 }
    );
  }
}
