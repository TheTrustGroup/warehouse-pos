import { NextRequest, NextResponse } from 'next/server';
import { getWarehouseProducts, createWarehouseProduct } from '@/lib/data/warehouseProducts';
import { requireAdmin } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
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

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json();
    const created = await createWarehouseProduct(body);
    return NextResponse.json(created);
  } catch (e) {
    console.error('[admin/api/products POST]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to create product' },
      { status: 400 }
    );
  }
}
