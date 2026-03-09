/**
 * GET /api/health — liveness/readiness for load balancers and npm run test:health.
 * No auth. Returns 200 with { status: 'ok' } when the server is up.
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';
/** Explicit ceiling for cron warmup; health responds in < 1s. */
export const maxDuration = 10;

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withCors(
    NextResponse.json({ status: 'ok' }, { status: 200 }),
    request
  );
}
