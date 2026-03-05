/**
 * GET /api/reports/sales — Sales report metrics from sales + sale_lines (SQL aggregation).
 * Query: warehouse_id (required), from (ISO), to (ISO). Optional: period=today|week|month|last_month|quarter|year overrides from/to.
 * Returns: revenue, cogs, grossProfit, marginPct, transactionCount, unitsSold, averageOrderValue, topProducts, salesByDay.
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { requireAuth } from '@/lib/auth/session';
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

function periodToRange(period: string): { from: string; to: string } | null {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  const from = new Date(now);

  switch (period.toLowerCase()) {
    case 'today':
      from.setHours(0, 0, 0, 0);
      break;
    case 'week': {
      const day = from.getDay();
      from.setDate(from.getDate() - day);
      from.setHours(0, 0, 0, 0);
      break;
    }
    case 'month':
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      break;
    case 'last_month': {
      from.setMonth(from.getMonth() - 1);
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      to.setTime(from.getTime());
      to.setMonth(to.getMonth() + 1);
      to.setDate(0);
      to.setHours(23, 59, 59, 999);
      break;
    }
    case 'quarter': {
      const q = Math.floor(from.getMonth() / 3) + 1;
      from.setMonth((q - 1) * 3);
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      break;
    }
    case 'year':
      from.setMonth(0);
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      break;
    default:
      return null;
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const h = corsHeaders(req);
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return withCors(auth, req);

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get('warehouse_id')?.trim() ?? '';
  const period = searchParams.get('period')?.trim() ?? '';
  let from = searchParams.get('from')?.trim() ?? '';
  let to = searchParams.get('to')?.trim() ?? '';

  const scope = await getScopeForUser(auth.email);
  const isAdmin = /^(admin|super_admin)$/i.test(auth.role ?? '');
  const allowed = scope.allowedWarehouseIds;
  const effectiveWarehouseId = warehouseId && (isAdmin || allowed.includes(warehouseId)) ? warehouseId : allowed[0];

  if (!effectiveWarehouseId) {
    return withCors(
      NextResponse.json({ error: 'warehouse_id is required or no warehouse access' }, { status: 400, headers: h }),
      req
    );
  }

  if (period) {
    const range = periodToRange(period);
    if (range) {
      from = range.from;
      to = range.to;
    }
  }

  const pFrom = from ? `${from.replace('Z', '')}Z` : null;
  const pTo = to ? `${to.replace('Z', '')}Z` : null;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('get_sales_report', {
      p_warehouse_id: effectiveWarehouseId,
      p_from: pFrom,
      p_to: pTo,
    });

    if (error) {
      console.error('[GET /api/reports/sales] RPC error:', error.message);
      return withCors(
        NextResponse.json({ error: 'Failed to load sales report. Ensure get_sales_report RPC exists.' }, { status: 500, headers: h }),
        req
      );
    }

    const report = (data ?? {}) as Record<string, unknown>;
    return withCors(NextResponse.json(report, { headers: h }), req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load sales report';
    console.error('[GET /api/reports/sales]', msg);
    return withCors(NextResponse.json({ error: msg }, { status: 500, headers: h }), req);
  }
}
