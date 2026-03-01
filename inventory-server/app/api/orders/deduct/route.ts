import { NextRequest, NextResponse } from 'next/server';
import { processSaleDeductions } from '@/lib/data/warehouseInventory';
import { requirePosRole } from '@/lib/auth/session';
import { corsHeaders } from '@/lib/cors';
import { warehouseItemsBodySchema } from '@/lib/schemas/requestBodies';

export const dynamic = 'force-dynamic';

/**
 * POST /api/orders/deduct — atomic batch deduction for order "out for delivery".
 * Same semantics as /api/inventory/deduct; cashier+ only. Body: { warehouseId, items: [{ productId, quantity }] }.
 */
function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

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

    await processSaleDeductions(warehouseId, items);
    return withCors(NextResponse.json({ ok: true }), request);
  } catch (e: unknown) {
    const err = e as Error & { status?: number };
    const isInsufficient = err.message?.includes('INSUFFICIENT_STOCK') ?? err.status === 409;
    return withCors(
      NextResponse.json(
        { message: err.message ?? 'Deduction failed' },
        { status: isInsufficient ? 409 : 400 }
      ),
      request
    );
  }
}
