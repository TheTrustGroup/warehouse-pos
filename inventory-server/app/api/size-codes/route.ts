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

/** GET /api/size-codes — list size codes for admin/POS (size selector). No auth required. Returns 200 with data: [] on DB/env error so inventory never gets 500. */
export async function GET(request: NextRequest) {
  try {
    const list = await getSizeCodes();
    return withCors(NextResponse.json({ data: list }), request);
  } catch (e) {
    console.error('[api/size-codes GET]', e instanceof Error ? e.message : e);
    return withCors(NextResponse.json({ data: [] }), request);
  }
}
