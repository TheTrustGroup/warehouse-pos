import { NextRequest, NextResponse } from 'next/server';
import { getWarehouseProducts, createWarehouseProduct } from '@/lib/data/warehouseProducts';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const list = await getWarehouseProducts();
    return NextResponse.json(list);
  } catch (e) {
    console.error('[admin/api/products GET]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to load products' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
