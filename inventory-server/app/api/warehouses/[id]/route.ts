import { NextRequest, NextResponse } from 'next/server';
import { getWarehouseById } from '@/lib/data/warehouses';
import { requireAuth } from '@/lib/auth/session';
import { resolveUserScope, isWarehouseAllowed, logScopeDeny } from '@/lib/auth/scope';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const warehouse = await getWarehouseById(id);
    if (!warehouse) return NextResponse.json({ message: 'Warehouse not found' }, { status: 404 });
    const scope = await resolveUserScope(auth);
    if (!isWarehouseAllowed(scope, warehouse.id)) {
      logScopeDeny({ path: request.nextUrl.pathname, method: request.method, email: auth.email, warehouseId: id });
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json(warehouse);
  } catch (e) {
    console.error('[api/warehouses/[id] GET]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to load warehouse' },
      { status: 500 }
    );
  }
}
