import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getQuantitiesBySize } from '@/lib/data/warehouseInventoryBySize';

export const dynamic = 'force-dynamic';

/** GET canonical per-size inventory for one product (DB size_code, quantity). Used when opening edit modal so form shows exact DB values. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const warehouseId = searchParams.get('warehouse_id')?.trim();
  if (!warehouseId) {
    return NextResponse.json({ message: 'warehouse_id is required' }, { status: 400 });
  }
  try {
    const rows = await getQuantitiesBySize(warehouseId, id);
    return NextResponse.json({ data: rows });
  } catch (e) {
    console.error('[api/products/[id]/inventory-by-size GET]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to load inventory by size' },
      { status: 500 }
    );
  }
}
