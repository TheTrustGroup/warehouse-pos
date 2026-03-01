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

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return withCors(auth, request);

  const { searchParams } = new URL(request.url);
  const warehouseId = searchParams.get('warehouse_id') ?? undefined;
  const date = searchParams.get('date') ?? undefined;

  if (!warehouseId?.trim()) {
    return withCors(
      NextResponse.json({ error: 'warehouse_id is required' }, { status: 400 }),
      request
    );
  }

  const scope = await getScopeForUser(auth.email);
  if (scope.allowedWarehouseIds.length > 0 && !scope.allowedWarehouseIds.includes(warehouseId)) {
    return withCors(
      NextResponse.json({ error: 'Forbidden: warehouse not in scope' }, { status: 403 }),
      request
    );
  }

  try {
    const stats = await getDashboardStats(warehouseId.trim(), { date: date || undefined });
    return withCors(NextResponse.json(stats), request);
  } catch (e) {
    console.error('[api/dashboard GET]', e);
    return withCors(
      NextResponse.json(
        { message: e instanceof Error ? e.message : 'Failed to load dashboard' },
        { status: 500 }
      ),
      request
    );
  }
}
