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

/** Health check: no auth. Used by frontend warmup and deploy verification. ?env=1 adds env flags (no secrets). */
export async function GET(request: NextRequest) {
  const body: { status: string; ts: string; env?: { supabaseUrl: boolean; supabaseKey: boolean } } = {
    status: 'ok',
    ts: new Date().toISOString(),
  };
  const url = new URL(request.url);
  if (url.searchParams.get('env') === '1') {
    body.env = {
      supabaseUrl: !!(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim(),
      supabaseKey: !!(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY)?.trim(),
    };
  }
  const res = withCors(NextResponse.json(body), request);
  res.headers.set('Cache-Control', 'no-store, max-age=0');
  return res;
}
