/**
 * Products API — list, create, get-by-id, update, delete.
 * List: GET /api/products (no id).
 * Create: POST /api/products.
 * Get one: GET /api/products?id=xxx&warehouse_id=yyy (Vercel-safe; path /api/products/:id not routed).
 * Update: PUT or PATCH /api/products with body { id, warehouseId, ... }.
 * Delete: DELETE /api/products with body or query { id, warehouseId } (or warehouse_id).
 */
import { NextRequest, NextResponse } from 'next/server';

/** Allow up to 30s so large product lists (e.g. limit=1000) don't hit Vercel default 10s and cause "connection was lost". */
export const maxDuration = 30;
import { getWarehouseProducts, createWarehouseProduct } from '@/lib/data/warehouseProducts';
import { getScopeForUser } from '@/lib/data/userScopes';
import { requireAuth, requireAdmin, getEffectiveWarehouseId } from '@/lib/auth/session';
import { logDurability } from '@/lib/data/durabilityLogger';
import {
  handleGetProductById,
  handlePutProductById,
  handleDeleteProductById,
} from '@/lib/api/productByIdHandlers';
import type { PutProductBody } from '@/lib/data/warehouseProducts';

export const dynamic = 'force-dynamic';

function getRequestId(request: NextRequest): string {
  return request.headers.get('x-request-id')?.trim() || request.headers.get('x-correlation-id')?.trim() || crypto.randomUUID();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth as NextResponse;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();
  if (id) {
    const warehouseId = searchParams.get('warehouse_id') ?? '';
    return handleGetProductById(id, warehouseId);
  }
  try {
    const warehouseId = searchParams.get('warehouse_id') ?? undefined;
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    const q = searchParams.get('q') ?? undefined;
    const category = searchParams.get('category') ?? undefined;
    const lowStock = searchParams.get('low_stock') === '1' || searchParams.get('low_stock') === 'true';
    const outOfStock = searchParams.get('out_of_stock') === '1' || searchParams.get('out_of_stock') === 'true';
    const result = await getWarehouseProducts(warehouseId, {
      limit: limit != null ? parseInt(limit, 10) : undefined,
      offset: offset != null ? parseInt(offset, 10) : undefined,
      q,
      category,
      lowStock,
      outOfStock,
    });
    return NextResponse.json({ data: result.data, total: result.total });
  } catch (e) {
    console.error('[api/products GET]', e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Failed to load products' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth as NextResponse;
  const requestId = getRequestId(request);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const warehouseId = (body?.warehouseId as string) ?? undefined;
  const scope = await getScopeForUser(auth.email);
  if (scope.allowedWarehouseIds.length > 0 && warehouseId && !scope.allowedWarehouseIds.includes(warehouseId)) {
    return NextResponse.json(
      { error: 'Forbidden: you do not have access to this warehouse' },
      { status: 403 }
    );
  }
  try {
    const created = await createWarehouseProduct(body);
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

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth as NextResponse;
  let body: PutProductBody & { id?: string };
  try {
    body = (await request.json()) as PutProductBody & { id?: string };
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return NextResponse.json({ error: 'id required in body' }, { status: 400 });
  const bodyWarehouseId = String(body.warehouseId ?? body.warehouse_id ?? '').trim();
  const warehouseId = await getEffectiveWarehouseId(auth, bodyWarehouseId || undefined, {
    path: request.nextUrl.pathname,
    method: 'PUT',
  });
  if (!warehouseId) return NextResponse.json({ error: 'warehouseId required' }, { status: 400 });
  return handlePutProductById(request, id, body, warehouseId, auth);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return PUT(request);
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth as NextResponse;
  const { searchParams } = new URL(request.url);
  let id = searchParams.get('id')?.trim() ?? '';
  let warehouseId: string | null = searchParams.get('warehouse_id')?.trim() ?? null;
  if (!id || !warehouseId) {
    try {
      const body = (await request.json()) as { id?: string; warehouseId?: string; warehouse_id?: string };
      id = id || String(body?.id ?? '').trim();
      warehouseId = warehouseId ?? (String(body?.warehouseId ?? body?.warehouse_id ?? '').trim() || null);
    } catch {
      /* body optional */
    }
  }
  if (!id) return NextResponse.json({ error: 'id required (query or body)' }, { status: 400 });
  if (!warehouseId) return NextResponse.json({ error: 'warehouseId required (query or body)' }, { status: 400 });
  return handleDeleteProductById(request, id, warehouseId, auth);
}
