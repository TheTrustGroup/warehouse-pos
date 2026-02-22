import { NextRequest, NextResponse } from 'next/server';
import { getWarehouses } from '@/lib/data/warehouses';
import { requireAuth } from '@/lib/auth/session';
import { resolveUserScope } from '@/lib/auth/scope';

export const dynamic = 'force-dynamic';

/** GET /api/warehouses — list warehouses. Optional store_id filter. Non-admin: filtered by scope when set. */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('store_id') ?? undefined;
    const scope = await resolveUserScope(auth);
    const allowedWarehouseIds = scope.isUnrestricted ? undefined : scope.allowedWarehouseIds.length > 0 ? scope.allowedWarehouseIds : undefined;
    const list = await getWarehouses({ storeId, allowedWarehouseIds });
    return NextResponse.json(list);
  } catch (e) {
    console.error('[api/warehouses GET]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to load warehouses' },
      { status: 500 }
    );
  }
}
