import { NextRequest, NextResponse } from 'next/server';
import { deleteWarehouseProductsBulk } from '@/lib/data/warehouseProducts';
import { requireAdmin } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth as NextResponse;
  try {
    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids : [];
    if (ids.length === 0) {
      return NextResponse.json({ message: 'ids array required' }, { status: 400 });
    }
    await deleteWarehouseProductsBulk(ids);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error('[admin/api/products/bulk DELETE]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to delete products' },
      { status: 500 }
    );
  }
}
