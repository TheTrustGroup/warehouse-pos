import { NextRequest, NextResponse } from 'next/server';
import { processReturnStock } from '@/lib/data/warehouseInventory';
import { requirePosRole } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/orders/return-stock — atomic batch add (return) inventory for order cancel/return.
 * Cashier+ only. Body: { warehouseId: string, items: Array<{ productId: string, quantity: number }> }.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requirePosRole(request);
  if (auth instanceof NextResponse) return auth as NextResponse;
  try {
    const body = await request.json();
    const warehouseId = body.warehouseId as string;
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
      { status: err.status ?? 400 }
    );
  }
}
