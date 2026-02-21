import { NextRequest, NextResponse } from 'next/server';
import { getWarehouseProducts, createWarehouseProduct } from '@/lib/data/warehouseProducts';
import { requireAdmin } from '@/lib/auth/session';
import { logDurability } from '@/lib/data/durabilityLogger';

export const dynamic = 'force-dynamic';

function getRequestId(request: NextRequest): string {
  return request.headers.get('x-request-id')?.trim() || request.headers.get('x-correlation-id')?.trim() || crypto.randomUUID();
}

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get('warehouse_id') ?? undefined;
    const limit = searchParams.get('limit');
    const category = searchParams.get('category') ?? undefined;
    const inStock = searchParams.get('in_stock') === '1' || searchParams.get('in_stock') === 'true';
    const data = await getWarehouseProducts(warehouseId, {
      limit: limit != null ? parseInt(limit, 10) : undefined,
      category,
      inStock: inStock || undefined,
    });
    return NextResponse.json({ data, total: data.length });
  } catch (e) {
    console.error('[admin/api/products GET]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to load products' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const requestId = getRequestId(request);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const warehouseId = (body?.warehouseId as string) ?? undefined;
  try {
    const created = await createWarehouseProduct(body);
    const entityId = (created as { id?: string })?.id ?? '';
    logDurability({
      status: 'success',
      entity_type: 'product',
      entity_id: entityId,
      warehouse_id: warehouseId,
      request_id: requestId,
      user_role: auth.role,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const entityId = (body?.id && typeof body.id === 'string' ? body.id : '') || 'unknown';
    logDurability({
      status: 'failed',
      entity_type: 'product',
      entity_id: entityId,
      warehouse_id: warehouseId,
      request_id: requestId,
      user_role: auth.role,
      message: e instanceof Error ? e.message : 'Failed to create product',
    });
    console.error('[admin/api/products POST]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to create product' },
      { status: 400 }
    );
  }
}
