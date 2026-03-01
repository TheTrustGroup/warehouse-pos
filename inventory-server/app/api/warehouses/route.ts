import { NextRequest, NextResponse } from 'next/server';
import { getWarehouses } from '@/lib/data/warehouses';
import { requireAuth } from '@/lib/auth/session';
import { resolveUserScope } from '@/lib/auth/scope';
import { corsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

/** GET /api/warehouses — list warehouses. Optional store_id filter. Non-admin: filtered by scope when set. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return withCors(auth, request);
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('store_id') ?? undefined;
    const scope = await resolveUserScope(auth);
    const allowedWarehouseIds = scope.isUnrestricted ? undefined : scope.allowedWarehouseIds.length > 0 ? scope.allowedWarehouseIds : undefined;
    const list = await getWarehouses({ storeId, allowedWarehouseIds });
    return withCors(NextResponse.json(list), request);
  } catch (e) {
    console.error('[api/warehouses GET]', e);
    return withCors(
      NextResponse.json(
        { message: e instanceof Error ? e.message : 'Failed to load warehouses' },
        { status: 500 }
      ),
      request
    );
  }
}
