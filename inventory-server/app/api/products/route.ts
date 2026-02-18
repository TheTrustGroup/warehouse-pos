import { NextRequest, NextResponse } from 'next/server';
import { getWarehouseProducts, createWarehouseProduct } from '@/lib/data/warehouseProducts';
import { requireAuth, requireAdmin } from '@/lib/auth/session';
import { logDurability } from '@/lib/data/durabilityLogger';
import { debugLog } from '@/lib/debugLog';

export const dynamic = 'force-dynamic';

function getRequestId(request: NextRequest): string {
  return request.headers.get('x-request-id')?.trim() || request.headers.get('x-correlation-id')?.trim() || crypto.randomUUID();
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get('warehouse_id') ?? undefined;
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    const q = searchParams.get('q') ?? undefined;
    const category = searchParams.get('category') ?? undefined;
    const lowStock = searchParams.get('low_stock') === '1' || searchParams.get('low_stock') === 'true';
    const outOfStock = searchParams.get('out_of_stock') === '1' || searchParams.get('out_of_stock') === 'true';
    const pos = searchParams.get('pos') === '1' || searchParams.get('pos') === 'true';
    const result = await getWarehouseProducts(warehouseId, {
      limit: limit != null ? parseInt(limit, 10) : undefined,
      offset: offset != null ? parseInt(offset, 10) : undefined,
      q,
      category,
      lowStock,
      outOfStock,
      pos,
    });
    // #region agent log
    const firstList = (result.data ?? [])[0] as { id?: string; sizeKind?: string; quantityBySize?: unknown[] } | undefined;
    const firstSized = (result.data ?? []).find((p: { sizeKind?: string; quantityBySize?: unknown[] }) => p.sizeKind === 'sized' || (Array.isArray(p.quantityBySize) && p.quantityBySize.length > 0));
    debugLog({ location: 'api/products/route.ts:GET', message: 'Product list API response', data: { firstId: firstList?.id, firstSizeKind: firstList?.sizeKind, firstQuantityBySizeLength: Array.isArray(firstList?.quantityBySize) ? firstList.quantityBySize.length : 0, firstSizedId: (firstSized as { id?: string })?.id, firstSizedQuantityBySizeLength: Array.isArray((firstSized as { quantityBySize?: unknown[] })?.quantityBySize) ? (firstSized as { quantityBySize: unknown[] }).quantityBySize.length : 0, total: result.data?.length ?? 0 }, hypothesisId: 'H4' });
    // #endregion
    return NextResponse.json({ data: result.data, total: result.total });
  } catch (e) {
    console.error('[api/products GET]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to load products' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const requestId = getRequestId(request);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const warehouseId = (body?.warehouseId as string) ?? undefined;
  // #region agent log
  const bodySizes = body?.quantityBySize as unknown[] | undefined;
  debugLog({ location: 'api/products/route.ts:POST', message: 'Incoming request body (sizes)', data: { sizeKind: body?.sizeKind, quantityBySizeLength: Array.isArray(bodySizes) ? bodySizes.length : 0, hasQuantityBySize: Array.isArray(bodySizes) && bodySizes.length > 0 }, hypothesisId: 'H3' });
  // #endregion
  try {
    const created = await createWarehouseProduct(body);
    // #region agent log
    const createdSizes = (created as { quantityBySize?: unknown[] })?.quantityBySize;
    debugLog({ location: 'api/products/route.ts:POST', message: 'Created product (saved)', data: { createdId: (created as { id?: string })?.id, createdSizeKind: (created as { sizeKind?: string })?.sizeKind, createdQuantityBySizeLength: Array.isArray(createdSizes) ? createdSizes.length : 0 }, hypothesisId: 'H4' });
    // #endregion
    const entityId = (created as { id?: string })?.id ?? '';
    logDurability({
      status: 'success',
      entity_type: 'product',
      entity_id: entityId,
      warehouse_id: warehouseId,
      request_id: requestId,
      user_role: auth.role,
    });
    // Return complete saved product so client can update UI without a follow-up GET
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const entityId = (body?.id && typeof body.id === 'string' ? body.id : '') || 'unknown';
    logDurability({
      status: 'failed',
      entity_type: 'product',
      entity_id: entityId,
      warehouse_id: warehouseId,
      request_id: requestId,
      user_role: auth.role,
      message: e instanceof Error ? e.message : 'Failed to create product',
    });
    console.error('[api/products POST]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to create product' },
      { status: 400 }
    );
  }
}
