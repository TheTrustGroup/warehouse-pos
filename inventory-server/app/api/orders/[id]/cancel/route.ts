import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/orders/[id]/cancel — acknowledge order cancellation (auth required).
 * This backend does not persist orders; the route exists so the frontend receives 200
 * instead of 404. Inventory return is done by the client via POST /api/orders/return-stock
 * before calling this. When order persistence is added, extend this to update order status in DB.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth as NextResponse;
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ message: 'Order id required' }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      id: id.trim(),
      status: 'cancelled',
    });
  } catch (e) {
    console.error('[api/orders cancel PATCH]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Cancel failed' },
      { status: 500 }
    );
  }
}
