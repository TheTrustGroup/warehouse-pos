/**
 * POST /api/auth/logout — clear session cookie and return 200.
 * No auth required so expired sessions can still clear the cookie.
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const h = corsHeaders(req);
  const response = NextResponse.json({ ok: true }, { status: 200, headers: h });
  clearSessionCookie(response);
  return withCors(response, req);
}
