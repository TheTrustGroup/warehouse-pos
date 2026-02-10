import { NextRequest, NextResponse } from 'next/server';
import { processSale } from '@/lib/data/transactions';
import { requirePosRole } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** POST /api/transactions — persist sale. Cashier+ only. */
export async function POST(request: NextRequest) {
  const auth = requirePosRole(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json();
    const warehouseId = body.warehouseId ?? body.warehouse_id;
    if (!warehouseId) {
      return NextResponse.json(
        { message: 'warehouseId required' },
        { status: 400 }
      );
    }
    const payload = {
      id: body.id,
      transactionNumber: body.transactionNumber ?? body.transaction_number,
      type: body.type ?? 'sale',
      warehouseId,
      items: Array.isArray(body.items) ? body.items : [],
      subtotal: Number(body.subtotal) ?? 0,
      tax: Number(body.tax) ?? 0,
      discount: Number(body.discount) ?? 0,
      total: Number(body.total) ?? 0,
      paymentMethod: body.paymentMethod ?? body.payment_method ?? 'cash',
      payments: Array.isArray(body.payments) ? body.payments : [],
      cashier: body.cashier ?? '',
      customer: body.customer ?? null,
      status: body.status ?? 'completed',
      syncStatus: body.syncStatus ?? body.sync_status ?? 'synced',
      createdAt: body.createdAt ?? body.created_at ?? new Date().toISOString(),
      completedAt: body.completedAt ?? body.completed_at ?? null,
    };
    const result = await processSale(payload);
    return NextResponse.json({ id: result.id, ...body });
  } catch (e: unknown) {
    const err = e as Error & { status?: number };
    const status = err.status === 409 ? 409 : 400;
    return NextResponse.json(
      { message: err.message ?? 'Transaction failed' },
      { status }
    );
  }
}
