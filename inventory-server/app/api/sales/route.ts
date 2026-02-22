/**
 * GET /api/sales — list sales (e.g. for dashboard "Today's Sales").
 * Query: warehouse_id (required for scoping), date (YYYY-MM-DD), limit.
 * Stub: returns empty array until a sales/transactions table and implementation exist.
 * Dashboard expects array of { total?: number } or { data: [...] } / { sales: [...] }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';

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

  // Stub: no sales table yet. Return shape dashboard expects; total will be 0.
  const data: Array<{ total?: number }> = [];
  return NextResponse.json({ data, total: data.length });
}
