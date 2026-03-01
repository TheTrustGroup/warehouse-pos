import { NextRequest, NextResponse } from 'next/server';
import { processReturnStock } from '@/lib/data/warehouseInventory';
import { requirePosRole } from '@/lib/auth/session';
import { corsHeaders } from '@/lib/cors';
import { warehouseItemsBodySchema } from '@/lib/schemas/requestBodies';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/**
 * POST /api/orders/return-stock — atomic batch add (return) inventory for order cancel/return.
 * Cashier+ only. Body: { warehouseId: string, items: Array<{ productId: string, quantity: number }> }.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requirePosRole(request);
  if (auth instanceof NextResponse) return withCors(auth, request);
  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = warehouseItemsBodySchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid request body';
      return withCors(NextResponse.json({ message: msg }, { status: 400 }), request);
    }
    const { warehouseId, items } = parsed.data;

    await processReturnStock(warehouseId, items);
    return withCors(NextResponse.json({ ok: true }), request);
  } catch (e: unknown) {
    const err = e as Error & { status?: number };
    return withCors(
      NextResponse.json(
        { message: err.message ?? 'Return stock failed' },
        { status: err.status ?? 400 }
      ),
      request
    );
  }
}
