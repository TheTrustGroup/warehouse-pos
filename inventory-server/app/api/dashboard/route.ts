/**
 * GET /api/dashboard — warehouse stats (stock value, counts, low-stock items, today's sales).
 * Query: warehouse_id (required), date (optional, YYYY-MM-DD).
 * Auth: Bearer or session cookie; warehouse_id must be in user scope.
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { getRequestId, jsonError } from '../../../lib/apiResponse';
import { logApiResponse } from '../../../lib/requestLog';
import { requireAuth } from '@/lib/auth/session';
import { getScopeForUser } from '@/lib/data/userScopes';
import { getDashboardStats } from '@/lib/data/dashboardStats';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  const h = corsHeaders(req);
  Object.entries(h).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const start = Date.now();
  const requestId = getRequestId(req);
  const h = corsHeaders(req);
  const fail = (status: number, message: string, code?: string): NextResponse => {
    logApiResponse(req, status, Date.now() - start, { message, code });
    return withCors(jsonError(status, message, { code, requestId, headers: h }), req);
  };

  try {
    if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return fail(500, 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    }

    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return withCors(auth, req);

    const { searchParams } = new URL(req.url);
    const queryWarehouseId = searchParams.get('warehouse_id')?.trim() ?? '';
    const date = searchParams.get('date')?.trim() || new Date().toISOString().split('T')[0];

    const scope = await getScopeForUser(auth.email);
    const allowed = scope.allowedWarehouseIds;
    const roleNorm = (auth.role ?? '').toLowerCase().replace(/\s+/g, '_');
    const isAdminNoScope = (roleNorm === 'admin' || roleNorm === 'super_admin') && allowed.length === 0;
    const warehouseId = queryWarehouseId
      ? (isAdminNoScope ? queryWarehouseId : allowed.includes(queryWarehouseId) ? queryWarehouseId : '')
      : (allowed[0] ?? '');

    if (!warehouseId) {
      return withCors(
        NextResponse.json(
          { error: allowed.length ? 'warehouse_id required or must be in your scope' : 'No warehouse access' },
          { status: 400, headers: h }
        ),
        req
      );
    }

    const stats = await getDashboardStats(warehouseId, { date, signal: req.signal });
    const res = NextResponse.json(stats, { headers: h });
    res.headers.set('Cache-Control', 'private, no-store, max-age=0');
    logApiResponse(req, 200, Date.now() - start);
    return withCors(res, req);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load dashboard';
    console.error('[GET /api/dashboard]', message);
    return fail(500, message);
  }
}
