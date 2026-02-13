import { NextRequest, NextResponse } from 'next/server';
import { getWarehouseProductById, updateWarehouseProduct, deleteWarehouseProduct } from '@/lib/data/warehouseProducts';
import { requireAdmin } from '@/lib/auth/session';
import { logDurability } from '@/lib/data/durabilityLogger';

export const dynamic = 'force-dynamic';

function getRequestId(request: NextRequest): string {
  return request.headers.get('x-request-id')?.trim() || request.headers.get('x-correlation-id')?.trim() || crypto.randomUUID();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const warehouseId = searchParams.get('warehouse_id') ?? undefined;
  try {
    const product = await getWarehouseProductById(id, warehouseId);
    if (!product) return NextResponse.json({ message: 'Product not found' }, { status: 404 });
    return NextResponse.json(product);
  } catch (e) {
    console.error('[admin/api/products/[id] GET]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to load product' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const requestId = getRequestId(request);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const warehouseId = (body?.warehouseId as string) ?? undefined;
  try {
    const updated = await updateWarehouseProduct(id, body);
    logDurability({
      status: 'success',
      entity_type: 'product',
      entity_id: id,
      warehouse_id: warehouseId,
      request_id: requestId,
      user_role: auth.role,
    });
    return NextResponse.json(updated);
  } catch (e: unknown) {
    const err = e as Error & { status?: number };
    logDurability({
      status: 'failed',
      entity_type: 'product',
      entity_id: id,
      warehouse_id: warehouseId,
      request_id: requestId,
      user_role: auth.role,
      message: err?.message ?? 'Failed to update product',
    });
    if (err?.status === 404) return NextResponse.json({ message: 'Product not found' }, { status: 404 });
    if (err?.status === 409) return NextResponse.json({ message: err.message ?? 'Version conflict' }, { status: 409 });
    console.error('[admin/api/products/[id] PUT]', e);
    return NextResponse.json(
      { message: e instanceof Error ? (e as Error).message : 'Failed to update product' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    await deleteWarehouseProduct(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error('[admin/api/products/[id] DELETE]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to delete product' },
      { status: 500 }
    );
  }
}
