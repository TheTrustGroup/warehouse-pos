import { NextRequest, NextResponse } from 'next/server';
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

/** GET /api/size-codes — list size codes for admin/POS (size selector). No auth required so POS can cache. Ignores warehouse_id (size codes are global). */
export async function GET(request: NextRequest) {
  try {
    const list = await getSizeCodes();
    return withCors(NextResponse.json({ data: list }), request);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[api/size-codes GET]', message);
    return withCors(
      NextResponse.json(
        { message: 'Size codes temporarily unavailable' },
        { status: 503 }
      ),
      request
    );
  }
}
