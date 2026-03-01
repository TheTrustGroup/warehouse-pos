import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session';
import { corsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const res = new NextResponse(null, { status: 204 });
  Object.entries(corsHeaders(request)).forEach(([k, v]) => res.headers.set(k, v));
  clearSessionCookie(res);
  return res;
}
