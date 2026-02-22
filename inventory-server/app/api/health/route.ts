/**
 * GET /api/health — readiness for load balancers and post-deploy checks.
 * No auth. Returns 200 when the process is up; optionally checks DB.
 */

import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(req: NextRequest) {
  const h = corsHeaders(req);
  const body: { status: string; db?: string; timestamp: string } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };

  try {
    const { getSupabase } = await import('@/lib/supabase');
    const supabase = getSupabase();
    const { error } = await supabase.from('warehouse_products').select('id').limit(1).maybeSingle();
    body.db = error ? 'unavailable' : 'ok';
  } catch {
    body.db = 'unavailable';
  }

  return NextResponse.json(body, { status: 200, headers: h });
}
