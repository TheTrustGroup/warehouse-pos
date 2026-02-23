/**
 * GET /api/dashboard — aggregated stats for the dashboard (single small payload).
 * Query: warehouse_id (required), date (optional, default today).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getScopeForUser } from '@/lib/data/userScopes';
import { getDashboardStats } from '@/lib/data/dashboardStats';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth as NextResponse;

  const { searchParams } = new URL(request.url);
  const warehouseId = searchParams.get('warehouse_id') ?? undefined;
  const date = searchParams.get('date') ?? undefined;

  if (!warehouseId?.trim()) {
    return NextResponse.json(
      { error: 'warehouse_id is required' },
      { status: 400 }
    );
  }

  const scope = await getScopeForUser(auth.email);
  if (scope.allowedWarehouseIds.length > 0 && !scope.allowedWarehouseIds.includes(warehouseId)) {
    return NextResponse.json({ error: 'Forbidden: warehouse not in scope' }, { status: 403 });
  }

  try {
    const stats = await getDashboardStats(warehouseId.trim(), { date: date || undefined });
    return NextResponse.json(stats);
  } catch (e) {
    console.error('[api/dashboard GET]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to load dashboard' },
      { status: 500 }
    );
  }
}
