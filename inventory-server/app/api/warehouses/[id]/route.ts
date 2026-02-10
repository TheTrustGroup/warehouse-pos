import { NextResponse } from 'next/server';
import { getWarehouseById } from '@/lib/data/warehouses';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const warehouse = await getWarehouseById(id);
    if (!warehouse) return NextResponse.json({ message: 'Warehouse not found' }, { status: 404 });
    return NextResponse.json(warehouse);
  } catch (e) {
    console.error('[api/warehouses/[id] GET]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to load warehouse' },
      { status: 500 }
    );
  }
}
