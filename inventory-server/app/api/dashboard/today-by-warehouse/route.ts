/**
 * GET /api/dashboard/today-by-warehouse?date=YYYY-MM-DD
 * Returns today's sales total per warehouse: { [warehouseId]: number }.
 * Used by Admin Control Panel to show "Today's sales by location" (Main Store | Main Town).
 * Auth required.
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { requireAuth } from '@/lib/auth/session';
import { getTodaySalesByWarehouse } from '@/lib/data/dashboardStats';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return withCors(auth, req);

  const sp = req.nextUrl.searchParams;
  const date = sp.get('date')?.trim() ?? new Date().toISOString().split('T')[0];

  try {
    const data = await getTodaySalesByWarehouse(date);
    return withCors(NextResponse.json(data), req);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error';
    return withCors(
      NextResponse.json({ error: message }, { status: 500 }),
      req
    );
  }
}
