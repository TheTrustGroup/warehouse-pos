/**
 * GET /api/reports/sales — sales report from get_sales_report RPC (revenue, COGS, profit, top products, by day).
 * Query: warehouse_id (required), from, to (ISO datetime).
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { requireAuth } from '@/lib/auth/session';
import { getScopeForUser } from '@/lib/data/userScopes';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

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

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get('warehouse_id')?.trim() ?? '';
  const fromRaw = searchParams.get('from')?.trim() ?? '';
  const toRaw = searchParams.get('to')?.trim() ?? '';

  const scope = await getScopeForUser(auth.email);
  if (scope.allowedWarehouseIds.length > 0 && !scope.allowedWarehouseIds.includes(warehouseId)) {
    return withCors(
      NextResponse.json({ error: 'Forbidden: warehouse not in scope' }, { status: 403, headers: h }),
      req
    );
  }
  if (!warehouseId) {
    return withCors(
      NextResponse.json({ error: 'warehouse_id is required' }, { status: 400, headers: h }),
      req
    );
  }

  const pFrom = fromRaw ? fromRaw : null;
  const pTo = toRaw ? toRaw : null;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('get_sales_report', {
      p_warehouse_id: warehouseId,
      p_from: pFrom,
      p_to: pTo,
    });
    if (error) {
      console.error('[GET /api/reports/sales] RPC error:', error.message);
      return withCors(
        NextResponse.json({ error: error.message ?? 'Failed to load sales report' }, { status: 500, headers: h }),
        req
      );
    }
    const payload = (data ?? {}) as Record<string, unknown>;
    return withCors(NextResponse.json(payload, { headers: h }), req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load sales report';
    console.error('[GET /api/reports/sales]', msg);
    return withCors(
      NextResponse.json({ error: msg }, { status: 500, headers: h }),
      req
    );
  }
}
