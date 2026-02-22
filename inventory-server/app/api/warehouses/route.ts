/**
 * GET /api/warehouses — list warehouses for the current user (scope-aware).
 * Used by frontend WarehouseContext for global warehouse switcher and Dashboard/Inventory scope.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getScopeForUser } from '@/lib/data/userScopes';
import { getWarehouses } from '@/lib/data/warehouses';
import { corsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: NextRequest) {
  const h = corsHeaders(request);
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) {
    Object.entries(h).forEach(([k, v]) => auth.headers.set(k, v));
    return auth;
  }

  try {
    const scope = await getScopeForUser(auth.email);
    const allowedWarehouseIds =
      scope.allowedWarehouseIds.length > 0 ? scope.allowedWarehouseIds : undefined;
    const list = await getWarehouses({ allowedWarehouseIds });
    return NextResponse.json(list, { headers: h });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/warehouses]', err);
    return NextResponse.json({ error: message }, { status: 500, headers: h });
  }
}
