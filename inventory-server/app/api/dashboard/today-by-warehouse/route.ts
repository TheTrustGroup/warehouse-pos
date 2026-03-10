/**
 * GET /api/dashboard/today-by-warehouse — today's sales total per warehouse for a date.
 * Query: date (optional, YYYY-MM-DD).
 * Auth: Bearer or session cookie.
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { getRequestId, jsonError } from '../../../../lib/apiResponse';
import { logApiResponse } from '../../../../lib/requestLog';
import { requireAuth } from '@/lib/auth/session';
import { getTodaySalesByWarehouse } from '@/lib/data/dashboardStats';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

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
    const date = searchParams.get('date')?.trim() || new Date().toISOString().split('T')[0];

    const data = await getTodaySalesByWarehouse(date);
    const res = NextResponse.json(data, { headers: h });
    res.headers.set('Cache-Control', 'private, no-store, max-age=0');
    logApiResponse(req, 200, Date.now() - start);
    return withCors(res, req);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load today-by-warehouse';
    console.error('[GET /api/dashboard/today-by-warehouse]', message);
    return fail(500, message);
  }
}
