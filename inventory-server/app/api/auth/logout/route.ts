/**
 * POST /api/auth/logout — clear session; client should clear token/cookie.
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { clearSessionCookie } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(_req: NextRequest): Promise<NextResponse> {
  const h = corsHeaders(_req);
  const res = NextResponse.json({ ok: true }, { status: 200, headers: h });
  clearSessionCookie(res);
  return withCors(res, _req);
}
