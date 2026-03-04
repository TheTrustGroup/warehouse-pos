import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getSizeCodes } from '@/lib/data/sizeCodes';
import { corsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

/** GET /api/size-codes — list size codes for admin/POS (size selector). Requires auth. Returns 200 with data: [] on DB/env error so inventory never gets 500. */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return withCors(auth, request);

  const ok = (data: { data: unknown[] }) => withCors(NextResponse.json(data), request);
  try {
    if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return ok({ data: [] });
    }
    const list = await getSizeCodes();
    return ok({ data: list });
  } catch (e) {
    console.error('[api/size-codes GET]', e instanceof Error ? e.message : e);
    return ok({ data: [] });
  }
}
