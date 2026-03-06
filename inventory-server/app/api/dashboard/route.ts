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
/** Vercel Pro allows 60s; keep under to leave room for serialization. Internal abort at 25s so we never hit platform limit. */
export const maxDuration = 60;

/** Abort in-flight work and return empty stats before platform timeout. */
const DASHBOARD_STATS_TIMEOUT_MS = 25_000;

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

/** Safe empty stats — return 200 so client does not retry storm; UI shows zeros + retry. */
const EMPTY_STATS = {
  totalStockValue: 0,
  totalProducts: 0,
  totalUnits: 0,
  lowStockCount: 0,
  outOfStockCount: 0,
  todaySales: 0,
  lowStockItems: [] as unknown[],
  categorySummary: {} as Record<string, { count: number; value: number }>,
  error: 'Stats temporarily unavailable',
};

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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DASHBOARD_STATS_TIMEOUT_MS);
      const statsPromise = getDashboardStats(warehouseId.trim(), {
        date: date || undefined,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('DASHBOARD_TIMEOUT')), DASHBOARD_STATS_TIMEOUT_MS);
      });
      const stats = await Promise.race([statsPromise, timeoutPromise]);
      return withCors(NextResponse.json(stats), request);
    } catch (e) {
      const isTimeout =
        (e instanceof Error && e.name === 'AbortError') ||
        (e instanceof Error && e.message === 'DASHBOARD_TIMEOUT');
      const message = e instanceof Error ? e.message : 'Failed to load dashboard';
      if (isTimeout) {
        console.warn('[api/dashboard GET] timed out or aborted, returning empty stats');
      } else {
        console.error('[api/dashboard GET]', message);
      }
      // Return 200 with empty stats so client does not retry storm; UI shows zeros + retry.
      return withCors(
        NextResponse.json({
          ...EMPTY_STATS,
          error: isTimeout ? 'Dashboard is taking too long. Please try again in a moment.' : 'Stats temporarily unavailable',
        }, { status: 200, headers: h }),
        request
      );
    }
  } catch (outer: unknown) {
    const msg = outer instanceof Error ? outer.message : 'Failed to load dashboard';
    console.error('[GET /api/dashboard] outer', msg);
    try {
      const h = corsHeaders(request);
      return withCors(
        NextResponse.json({ ...EMPTY_STATS }, { status: 200, headers: h }),
        request
      );
    } catch {
      return NextResponse.json(
        EMPTY_STATS,
        { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } }
      );
    }
  }
}
