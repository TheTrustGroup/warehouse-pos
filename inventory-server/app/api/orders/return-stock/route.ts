import { NextRequest, NextResponse } from 'next/server';
import { processReturnStock } from '@/lib/data/warehouseInventory';
import { requireAuth } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** POST /api/orders/return-stock — atomic batch add for order return (failed/cancelled). */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
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
      { status: 400 }
    );
  }
}
