import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { corsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

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
  if (auth instanceof NextResponse) return withCors(auth, request);
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return withCors(NextResponse.json({ message: 'Order id required' }, { status: 400 }), request);
    }
    return withCors(
      NextResponse.json({
        ok: true,
        id: id.trim(),
        status: 'cancelled',
      }),
      request
    );
  } catch (e) {
    console.error('[api/orders cancel PATCH]', e);
    return withCors(
      NextResponse.json(
        { message: e instanceof Error ? e.message : 'Cancel failed' },
        { status: 500 }
      ),
      request
    );
  }
}
