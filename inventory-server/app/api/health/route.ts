import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/** Health check: no auth. Used by frontend warmup and deploy verification. ?env=1 adds env flags. ?db=1 probes DB (warehouse_products). */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const body: {
    status: string;
    ts: string;
    env?: { supabaseUrl: boolean; supabaseKey: boolean; serviceRoleKey: boolean };
    db?: { ok: boolean; error?: string };
  } = {
    status: 'ok',
    ts: new Date().toISOString(),
  };

  if (url.searchParams.get('env') === '1') {
    const serviceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    body.env = {
      supabaseUrl: !!(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim(),
      supabaseKey: serviceRoleKey,
      serviceRoleKey,
    };
  }

  if (url.searchParams.get('db') === '1') {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from('warehouse_products').select('id').limit(1);
      body.db = error ? { ok: false, error: error.message } : { ok: true };
    } catch (e) {
      body.db = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const res = withCors(NextResponse.json(body), request);
  res.headers.set('Cache-Control', 'no-store, max-age=0');
  return res;
}
