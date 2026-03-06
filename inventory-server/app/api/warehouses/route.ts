/**
 * GET /api/warehouses — list warehouses for the current user (scope-filtered).
 * Used by WarehouseContext to populate the location dropdown and resolve current warehouse.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getScopeForUser } from '@/lib/data/userScopes';
import { getSupabase } from '@/lib/supabase';
import { corsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const h = corsHeaders(request);
  try {
    if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return withCors(
        NextResponse.json({ error: 'Server misconfiguration' }, { status: 500, headers: h }),
        request
      );
    }

    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return withCors(auth, request);

    const scope = await getScopeForUser(auth.email);
    const roleNorm = (auth.role ?? '').toLowerCase().replace(/\s+/g, '_');
    const isAdminNoScope = (roleNorm === 'admin' || roleNorm === 'super_admin') && scope.allowedWarehouseIds.length === 0;

    const db = getSupabase();
    let query = db.from('warehouses').select('id, name, created_at').order('created_at', { ascending: true });

    if (!isAdminNoScope && scope.allowedWarehouseIds.length > 0) {
      query = query.in('id', scope.allowedWarehouseIds);
    }

    const { data: rows, error } = await query;

    if (error) {
      console.error('[GET /api/warehouses]', error.message);
      return withCors(
        NextResponse.json({ error: 'Failed to load warehouses' }, { status: 500, headers: h }),
        request
      );
    }

    const list = Array.isArray(rows) ? rows : [];
    const warehouses = list.map((r: { id: string; name: string }) => ({
      id: String(r.id),
      name: r.name ?? '',
      code: '',
    }));

    return withCors(NextResponse.json(warehouses), request);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load warehouses';
    console.error('[GET /api/warehouses]', message);
    return withCors(
      NextResponse.json({ error: message }, { status: 500, headers: h }),
      request
    );
  }
}
