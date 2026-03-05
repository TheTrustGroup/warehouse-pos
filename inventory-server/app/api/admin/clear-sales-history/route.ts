/**
 * POST /api/admin/clear-sales-history — truncate sales and sale_lines, reset receipt_seq.
 * Admin/super_admin only. Requires explicit confirmation body to prevent accidental clears.
 * Audit: logs admin email and timestamp so this action is traceable.
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { requireAdmin } from '@/lib/auth/session';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const CONFIRM_VALUE = 'CLEAR_ALL_SALES';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const h = corsHeaders(req);
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return withCors(auth, req);
  let body: { confirm?: string };
  try {
    body = await req.json();
  } catch {
    return withCors(
      NextResponse.json(
        { error: 'Invalid JSON. Send body: { "confirm": "CLEAR_ALL_SALES" } to confirm.', ok: false },
        { status: 400, headers: h }
      ),
      req
    );
  }
  if (body?.confirm !== CONFIRM_VALUE) {
    return withCors(
      NextResponse.json(
        {
          error: 'Confirmation required. Send body: { "confirm": "CLEAR_ALL_SALES" } to clear all sales history.',
          ok: false,
        },
        { status: 400, headers: h }
      ),
      req
    );
  }
  try {
    const supabase = getSupabase();
    const { error } = await supabase.rpc('clear_sales_history');
    if (error) {
      console.error('[POST /api/admin/clear-sales-history] RPC', error);
      return withCors(
        NextResponse.json({ error: error.message, ok: false }, { status: 500, headers: h }),
        req
      );
    }
    // Audit log: who cleared sales and when (intentional console for production logs)
    // eslint-disable-next-line no-console
    console.info(
      `[AUDIT] clear_sales_history executed by admin email=${auth.email} at ${new Date().toISOString()}`
    );
    return withCors(
      NextResponse.json(
        { ok: true, message: 'Sales and delivery history cleared. Receipt numbers reset to 1.' },
        { status: 200, headers: h }
      ),
      req
    );
  } catch (e) {
    console.error('[POST /api/admin/clear-sales-history]', e);
    return withCors(
      NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed to clear history', ok: false },
        { status: 500, headers: h }
      ),
      req
    );
  }
}
