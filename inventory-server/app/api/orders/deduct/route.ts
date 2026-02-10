import { NextRequest, NextResponse } from 'next/server';
import { processSaleDeductions } from '@/lib/data/warehouseInventory';
import { requireAuth } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** POST /api/orders/deduct — atomic batch deduction for order out-for-delivery. Same as POS. */
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
