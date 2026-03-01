import { NextRequest, NextResponse } from 'next/server';
import { deleteWarehouseProductsBulk } from '@/lib/data/warehouseProducts';
import { requireAdmin } from '@/lib/auth/session';
import { corsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return withCors(auth, request);
  try {
    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids : [];
    if (ids.length === 0) {
      return withCors(NextResponse.json({ message: 'ids array required' }, { status: 400 }), request);
    }
    await deleteWarehouseProductsBulk(ids);
    return withCors(new NextResponse(null, { status: 204 }), request);
  } catch (e) {
    console.error('[admin/api/products/bulk DELETE]', e);
    return withCors(
      NextResponse.json(
        { message: e instanceof Error ? e.message : 'Failed to delete products' },
        { status: 500 }
      ),
      request
    );
  }
}
