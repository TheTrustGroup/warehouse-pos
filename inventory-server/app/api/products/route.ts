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
import { corsHeaders } from '@/lib/cors';
import { isValidId } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** CORS preflight for cross-origin PUT/PATCH/DELETE from the warehouse frontend. */
export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

function getRequestId(request: NextRequest): string {
  return request.headers.get('x-request-id')?.trim() || request.headers.get('x-correlation-id')?.trim() || crypto.randomUUID();
}

/** Attach CORS to a response so cross-origin fetch with credentials succeeds. */
function withCors(res: NextResponse, request: NextRequest): NextResponse {
  const h = corsHeaders(request);
  Object.entries(h).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return withCors(auth, request);
  const { searchParams } = new URL(request.url);
  const queryWarehouseId = searchParams.get('warehouse_id')?.trim() ?? undefined;
  const effectiveWarehouseId = await getEffectiveWarehouseId(auth, queryWarehouseId);

  const id = searchParams.get('id')?.trim();
  if (id) {
    if (!isValidId(id))
      return withCors(NextResponse.json({ error: 'Invalid product id' }, { status: 400 }), request);
    if (!effectiveWarehouseId)
      return withCors(
        NextResponse.json({ error: 'warehouse_id is required and must be in your scope' }, { status: 400 }),
        request
      );
    if (queryWarehouseId && queryWarehouseId !== effectiveWarehouseId)
      return withCors(
        NextResponse.json({ error: 'You do not have access to this warehouse' }, { status: 403 }),
        request
      );
    return withCors(await handleGetProductById(id, effectiveWarehouseId), request);
  }

  if (!effectiveWarehouseId)
    return withCors(
      NextResponse.json({ error: 'warehouse_id is required and must be in your scope' }, { status: 400 }),
      request
    );
  if (!isValidId(effectiveWarehouseId))
    return withCors(NextResponse.json({ error: 'Invalid warehouse_id' }, { status: 400 }), request);
  if (queryWarehouseId && queryWarehouseId !== effectiveWarehouseId)
    return withCors(
      NextResponse.json({ error: 'You do not have access to this warehouse' }, { status: 403 }),
      request
    );

  try {
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    const q = searchParams.get('q') ?? undefined;
    const category = searchParams.get('category') ?? undefined;
    const lowStock = searchParams.get('low_stock') === '1' || searchParams.get('low_stock') === 'true';
    const outOfStock = searchParams.get('out_of_stock') === '1' || searchParams.get('out_of_stock') === 'true';
    const result = await getWarehouseProducts(effectiveWarehouseId, {
      limit: limit != null ? parseInt(limit, 10) : undefined,
      offset: offset != null ? parseInt(offset, 10) : undefined,
      q,
      category,
      lowStock,
      outOfStock,
    });
    const res = withCors(NextResponse.json({ data: result.data, total: result.total }), request);
    res.headers.set('Cache-Control', 'private, max-age=0');
    return res;
  } catch (e) {
    console.error('[api/products GET]', e);
    return withCors(
      NextResponse.json(
        { message: e instanceof Error ? e.message : 'Failed to load products' },
        { status: 500 }
      ),
      request
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
    return withCors(NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 }), request);
  }
  const warehouseId = (body?.warehouseId as string) ?? undefined;
  if (warehouseId && !isValidId(warehouseId))
    return withCors(NextResponse.json({ error: 'Invalid warehouseId' }, { status: 400 }), request);
  const scope = await getScopeForUser(auth.email);
  if (scope.allowedWarehouseIds.length > 0 && warehouseId && !scope.allowedWarehouseIds.includes(warehouseId)) {
    return withCors(
      NextResponse.json(
        { error: 'Forbidden: you do not have access to this warehouse' },
        { status: 403 }
      ),
      request
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
    return withCors(NextResponse.json(created, { status: 201 }), request);
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
    return withCors(
      NextResponse.json(
        { message: e instanceof Error ? e.message : 'Failed to create product' },
        { status: 400 }
      ),
      request
    );
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return withCors(auth, request);
  let body: PutProductBody & { id?: string };
  try {
    body = (await request.json()) as PutProductBody & { id?: string };
  } catch {
    return withCors(NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 }), request);
  }
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return withCors(NextResponse.json({ error: 'id required in body' }, { status: 400 }), request);
  if (!isValidId(id)) return withCors(NextResponse.json({ error: 'Invalid product id' }, { status: 400 }), request);
  const bodyWarehouseId = String(body.warehouseId ?? body.warehouse_id ?? '').trim();
  const warehouseId = await getEffectiveWarehouseId(auth, bodyWarehouseId || undefined, {
    path: request.nextUrl.pathname,
    method: 'PUT',
  });
  if (!warehouseId) return withCors(NextResponse.json({ error: 'warehouseId required' }, { status: 400 }), request);
  if (!isValidId(warehouseId)) return withCors(NextResponse.json({ error: 'Invalid warehouseId' }, { status: 400 }), request);
  return withCors(await handlePutProductById(request, id, body, warehouseId, auth), request);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return PUT(request);
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return withCors(auth, request);
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
  if (!id) return withCors(NextResponse.json({ error: 'id required (query or body)' }, { status: 400 }), request);
  if (!warehouseId) return withCors(NextResponse.json({ error: 'warehouseId required (query or body)' }, { status: 400 }), request);
  if (!isValidId(id) || !isValidId(warehouseId))
    return withCors(NextResponse.json({ error: 'Invalid id or warehouseId' }, { status: 400 }), request);
  return withCors(await handleDeleteProductById(request, id, warehouseId, auth), request);
}
