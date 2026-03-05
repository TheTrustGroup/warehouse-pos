import { NextRequest, NextResponse } from 'next/server';
import { getWarehouseProducts, createWarehouseProduct, updateWarehouseProduct } from '@/lib/data/warehouseProducts';
import type { PutProductBody } from '@/lib/data/warehouseProducts';
import { requireAdmin, getEffectiveWarehouseId } from '@/lib/auth/session';
import { logDurability } from '@/lib/data/durabilityLogger';
import { notifyInventoryUpdated } from '@/lib/cache/dashboardStatsCache';

export const dynamic = 'force-dynamic';

function getRequestId(request: NextRequest): string {
  return request.headers.get('x-request-id')?.trim() || request.headers.get('x-correlation-id')?.trim() || crypto.randomUUID();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth as NextResponse;
  try {
    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get('warehouse_id') ?? undefined;
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    const q = searchParams.get('q') ?? undefined;
    const category = searchParams.get('category') ?? undefined;
    const lowStock = searchParams.get('low_stock') === '1' || searchParams.get('low_stock') === 'true';
    const outOfStock = searchParams.get('out_of_stock') === '1' || searchParams.get('out_of_stock') === 'true';
    const result = await getWarehouseProducts(warehouseId, {
      limit: limit != null ? parseInt(limit, 10) : undefined,
      offset: offset != null ? parseInt(offset, 10) : undefined,
      q,
      category,
      lowStock,
      outOfStock,
    });
    return NextResponse.json({ data: result.data, total: result.total });
  } catch (e) {
    console.error('[admin/api/products GET]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to load products' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth as NextResponse;
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
    const wid = (created as { warehouseId?: string })?.warehouseId ?? warehouseId;
    if (wid) await notifyInventoryUpdated(wid);
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

/** PUT /admin/api/products — update product (body: id, warehouseId, ...). Returns full updated product. */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth as NextResponse;
  let body: PutProductBody & { id?: string; warehouseId?: string; warehouse_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const productId = String(body?.id ?? '').trim();
  const bodyWarehouseId = String(body?.warehouseId ?? body?.warehouse_id ?? '').trim();
  const effectiveWarehouseId = await getEffectiveWarehouseId(auth, bodyWarehouseId || undefined);
  if (!productId || !effectiveWarehouseId) {
    return NextResponse.json(
      { message: 'id and warehouseId are required and warehouse must be in your scope' },
      { status: 400 }
    );
  }
  const normalizedBody: PutProductBody & { warehouseId?: string; warehouse_id?: string } = {
    ...body,
    tags: Array.isArray(body.tags) ? body.tags : [],
    images: Array.isArray(body.images) ? body.images : [],
    quantityBySize: Array.isArray(body.quantityBySize) ? body.quantityBySize : undefined,
  };
  try {
    const updated = await updateWarehouseProduct(productId, effectiveWarehouseId, normalizedBody);
    if (!updated) {
      return NextResponse.json({ message: 'Product not found' }, { status: 404 });
    }
    await notifyInventoryUpdated(effectiveWarehouseId);
    return NextResponse.json(updated);
  } catch (e) {
    console.error('[admin/api/products PUT]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to update product' },
      { status: 400 }
    );
  }
}
