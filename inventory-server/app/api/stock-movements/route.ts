import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { listStockMovements } from '@/lib/data/stockMovements';

export const dynamic = 'force-dynamic';

/** GET /api/stock-movements — list stock movements (admin only, read-only). Filters: warehouse_id, transaction_id, from, to. Pagination: limit, offset. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth as NextResponse;
  try {
    const { searchParams } = new URL(request.url);
    const warehouse_id = searchParams.get('warehouse_id') ?? undefined;
    const transaction_id = searchParams.get('transaction_id') ?? undefined;
    const from = searchParams.get('from') ?? undefined;
    const to = searchParams.get('to') ?? undefined;
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    const result = await listStockMovements({
      warehouse_id,
      transaction_id,
      from,
      to,
      limit: limit != null ? parseInt(limit, 10) : undefined,
      offset: offset != null ? parseInt(offset, 10) : undefined,
    });
    return NextResponse.json({ data: result.data, total: result.total });
  } catch (e) {
    console.error('[api/stock-movements GET]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to list stock movements' },
      { status: 500 }
    );
  }
}
