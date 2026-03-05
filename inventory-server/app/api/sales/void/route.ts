/**
 * POST /api/sales/void — set sale status to voided. Requires POS void permission (admin/manager).
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { requirePosRole } from '@/lib/auth/session';
import { getScopeForUser } from '@/lib/data/userScopes';
import { getSupabase } from '@/lib/supabase';
import { notifyInventoryUpdated } from '@/lib/cache/dashboardStatsCache';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const h = corsHeaders(req);
  const auth = await requirePosRole(req);
  if (auth instanceof NextResponse) return withCors(auth, req);
  const scope = await getScopeForUser(auth.email);
  let body: { saleId?: string; warehouseId?: string };
  try {
    body = await req.json();
  } catch {
    return withCors(NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: h }), req);
  }
  const saleId = typeof body.saleId === 'string' ? body.saleId.trim() : '';
  const warehouseId = typeof body.warehouseId === 'string' ? body.warehouseId.trim() : '';
  if (!saleId) {
    return withCors(NextResponse.json({ error: 'saleId required' }, { status: 400, headers: h }), req);
  }
  const allowed = scope.allowedWarehouseIds;
  const isAdmin = /^(admin|super_admin)$/i.test(auth.role ?? '');
  if (warehouseId && !isAdmin && !allowed.includes(warehouseId)) {
    return withCors(NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: h }), req);
  }
  try {
    const supabase = getSupabase();
    const { data: saleRow, error: fetchError } = await supabase
      .from('sales')
      .select('id, warehouse_id, status')
      .eq('id', saleId)
      .maybeSingle();
    if (fetchError) {
      console.error('[POST /api/sales/void] fetch', fetchError);
      return withCors(NextResponse.json({ error: fetchError.message }, { status: 500, headers: h }), req);
    }
    if (!saleRow) {
      return withCors(NextResponse.json({ error: 'Sale not found' }, { status: 404, headers: h }), req);
    }
    const saleWarehouseId = (saleRow as { warehouse_id?: string }).warehouse_id ?? '';
    if (saleWarehouseId && !isAdmin && !allowed.includes(saleWarehouseId)) {
      return withCors(NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: h }), req);
    }
    if (warehouseId && saleWarehouseId && saleWarehouseId !== warehouseId) {
      return withCors(NextResponse.json({ error: 'Sale not in specified warehouse' }, { status: 400, headers: h }), req);
    }
    const { error: rpcError } = await supabase.rpc('void_sale', { p_sale_id: saleId });
    if (rpcError) {
      console.error('[POST /api/sales/void] RPC', rpcError);
      const msg = rpcError.message ?? 'Failed to void sale';
      return withCors(
        NextResponse.json({ error: msg, detail: msg }, { status: 500, headers: h }),
        req
      );
    }
    if (saleWarehouseId) await notifyInventoryUpdated(saleWarehouseId);
    return withCors(
      NextResponse.json({ ok: true, voidedAt: new Date().toISOString() }, { status: 200, headers: h }),
      req
    );
  } catch (e) {
    console.error('[POST /api/sales/void]', e);
    return withCors(
      NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to void sale' }, { status: 500, headers: h }),
      req
    );
  }
}
