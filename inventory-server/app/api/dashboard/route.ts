/**
 * GET /api/dashboard — aggregated stats for the dashboard (single small payload).
 * Query: warehouse_id (required), date (optional, default today).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getScopeForUser } from '@/lib/data/userScopes';
import { getDashboardStats } from '@/lib/data/dashboardStats';
import { corsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';
/** Allow time for getWarehouseProducts + getTodaySalesTotal (cold start + Supabase). */
export const maxDuration = 30;

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const h = corsHeaders(request);
    const fail500 = (message: string): NextResponse =>
      withCors(NextResponse.json({ error: message }, { status: 500, headers: h }), request);

    try {
      if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        console.error('[GET /api/dashboard] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        return fail500('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in Vercel project environment variables.');
      }

      const auth = await requireAuth(request);
      if (auth instanceof NextResponse) return withCors(auth, request);

      const { searchParams } = new URL(request.url);
      const warehouseId = searchParams.get('warehouse_id') ?? undefined;
      const date = searchParams.get('date') ?? undefined;

      if (!warehouseId?.trim()) {
        return withCors(
          NextResponse.json({ error: 'warehouse_id is required' }, { status: 400, headers: h }),
          request
        );
      }

      const scope = await getScopeForUser(auth.email);
      if (scope.allowedWarehouseIds.length > 0 && !scope.allowedWarehouseIds.includes(warehouseId)) {
        return withCors(
          NextResponse.json({ error: 'Forbidden: warehouse not in scope' }, { status: 403, headers: h }),
          request
        );
      }

      const stats = await getDashboardStats(warehouseId.trim(), { date: date || undefined });
      return withCors(NextResponse.json(stats), request);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load dashboard';
      console.error('[api/dashboard GET]', message);
      return fail500(message);
    }
  } catch (outer: unknown) {
    const msg = outer instanceof Error ? outer.message : 'Failed to load dashboard';
    console.error('[GET /api/dashboard] outer', msg);
    try {
      const h = corsHeaders(request);
      return withCors(
        NextResponse.json({ error: msg }, { status: 500, headers: h }),
        request
      );
    } catch {
      return NextResponse.json(
        { error: msg },
        { status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } }
      );
    }
  }
}
