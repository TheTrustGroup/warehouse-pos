import { NextRequest, NextResponse } from 'next/server';
import { getWarehouseProductById, updateWarehouseProduct, deleteWarehouseProduct } from '@/lib/data/warehouseProducts';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const { id } = await params;
  try {
    const body = await request.json();
    const updated = await updateWarehouseProduct(id, body);
    return NextResponse.json(updated);
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err?.status === 404) return NextResponse.json({ message: 'Product not found' }, { status: 404 });
    console.error('[admin/api/products/[id] PUT]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to update product' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
