import { NextRequest, NextResponse } from 'next/server';
import { processSaleDeductions } from '@/lib/data/warehouseInventory';
import { requireWarehouseOrPosRole, getEffectiveWarehouseId } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** POST /api/orders/deduct — atomic batch deduction for order out-for-delivery. Warehouse or POS role. When session has warehouse_id, it overrides body. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireWarehouseOrPosRole(request);
  if (auth instanceof NextResponse) return auth as NextResponse;
  try {
    const body = await request.json();
    const bodyWarehouseId = body.warehouseId as string;
    const warehouseId = await getEffectiveWarehouseId(auth, bodyWarehouseId, {
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

    await processSaleDeductions(warehouseId, items);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as Error & { status?: number };
    const isInsufficient = err.message?.includes('INSUFFICIENT_STOCK') ?? err.status === 409;
    return NextResponse.json(
      { message: err.message ?? 'Deduction failed' },
      { status: isInsufficient ? 409 : 400 }
    );
  }
}
