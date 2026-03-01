import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/** Health check: no auth. Used by frontend warmup and deploy verification. */
export async function GET(request: NextRequest) {
  const body = { status: 'ok', ts: new Date().toISOString() };
  return withCors(NextResponse.json(body), request);
}
