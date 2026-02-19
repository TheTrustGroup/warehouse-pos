import { NextRequest, NextResponse } from 'next/server';
import { saveSizesToSupabase, type SizeFormRow } from '@/lib/data/warehouseInventoryBySize';
import { setQuantity } from '@/lib/data/warehouseInventory';
import { getWarehouseProductById } from '@/lib/data/warehouseProducts';
import { requireAuth, requireAdmin } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Normalize body row: accept sizeCode (frontend) or size_code. */
function toSizeFormRow(row: { size_code?: string; sizeCode?: string; quantity?: number }): SizeFormRow {
  const code = (row.size_code ?? row.sizeCode ?? '').toString().trim();
  const quantity = Number(row.quantity ?? 0);
  return { size_code: code, quantity };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id: productId } = await params;
  let body: { warehouseId: string; sizes?: Array<{ size_code?: string; sizeCode?: string; quantity?: number }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const warehouseId = (body?.warehouseId ?? '').toString().trim();
  if (!warehouseId) {
    return NextResponse.json({ message: 'warehouseId is required' }, { status: 400 });
  }
  const rawSizes = Array.isArray(body?.sizes) ? body.sizes : [];
  const sizesForm = rawSizes.map(toSizeFormRow).filter((s) => s.size_code);

  try {
    const product = await getWarehouseProductById(productId, warehouseId);
    if (!product) {
      return NextResponse.json({ message: 'Product not found' }, { status: 404 });
    }

    await saveSizesToSupabase(productId, warehouseId, sizesForm);

    const sum = sizesForm
      .filter((s) => Number(s.quantity) > 0)
      .reduce((acc, s) => acc + Math.floor(Number(s.quantity)), 0);
    await setQuantity(warehouseId, productId, sum);

    return NextResponse.json({ ok: true, message: 'Sizes saved successfully' });
  } catch (e) {
    console.error('[api/products/[id]/sizes PUT]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to save sizes' },
      { status: 500 }
    );
  }
}
