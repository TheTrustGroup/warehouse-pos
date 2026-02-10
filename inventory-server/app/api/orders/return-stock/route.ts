import { NextRequest, NextResponse } from 'next/server';
import { processReturnStock } from '@/lib/data/warehouseInventory';
import { requireWarehouseOrPosRole, getEffectiveWarehouseId } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** POST /api/orders/return-stock — atomic batch add for order return (failed/cancelled). Warehouse or POS role. When session has warehouse_id, it overrides body. */
export async function POST(request: NextRequest) {
  const auth = requireWarehouseOrPosRole(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json();
    const bodyWarehouseId = body.warehouseId as string;
    const warehouseId = getEffectiveWarehouseId(auth, bodyWarehouseId, {
      path: request.nextUrl.pathname,
      method: request.method,
    });
    const items = body.items as Array<{ productId: string; quantity: number }>;

    if (!warehouseId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { message: 'warehouseId and non-empty items array required' },
        { status: 400 }
      );
    }

    await processReturnStock(warehouseId, items);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as Error & { status?: number };
    return NextResponse.json(
      { message: err.message ?? 'Return stock failed' },
      { status: 400 }
    );
  }
}
