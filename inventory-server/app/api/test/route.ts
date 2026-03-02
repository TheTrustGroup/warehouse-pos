import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { corsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';

/** Smoke-test route: requires auth so it is not public in production. Use /api/health for unauthenticated uptime checks. */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    const h = corsHeaders(request);
    Object.entries(h).forEach(([k, v]) => auth.headers.set(k, v));
    return auth;
  }
  const h = corsHeaders(request);
  return NextResponse.json(
    { message: 'API is working!', timestamp: new Date().toISOString() },
    { headers: h }
  );
}
