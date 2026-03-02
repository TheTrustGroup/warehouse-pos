/**
 * GET /api/products — list products for a warehouse (Inventory + POS).
 * Query: warehouse_id (required), limit, offset, q, category, low_stock, out_of_stock.
 * Auth: Bearer or session cookie; warehouse_id must be in user scope (or admin with no scope).
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { requireAuth, getEffectiveWarehouseId } from '@/lib/auth/session';
import { getScopeForUser } from '@/lib/data/userScopes';
import {
  getWarehouseProducts,
  getProductById,
  createWarehouseProduct,
  updateWarehouseProduct,
  deleteWarehouseProduct,
} from '@/lib/data/warehouseProducts';
import type { PutProductBody } from '@/lib/data/warehouseProducts';

export const dynamic = 'force-dynamic';
/** Allow up to 30s so cold start + Supabase list + inventory/sizes queries don't hit 504. Vercel default can be 10s. */
export const maxDuration = 30;

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  const h = corsHeaders(req);
  Object.entries(h).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return withCors(auth, req);

  const h = corsHeaders(req);
  try {
    const { searchParams } = new URL(req.url);
    const queryWarehouseId = searchParams.get('warehouse_id')?.trim() ?? '';
    const scope = await getScopeForUser(auth.email);
    const allowed = scope.allowedWarehouseIds;
    const roleNorm = (auth.role ?? '').toLowerCase().replace(/\s+/g, '_');
    const isAdminNoScope = (roleNorm === 'admin' || roleNorm === 'super_admin') && allowed.length === 0;
    const warehouseId = queryWarehouseId
      ? (isAdminNoScope ? queryWarehouseId : (allowed.includes(queryWarehouseId) ? queryWarehouseId : ''))
      : (allowed[0] ?? '');

    if (!warehouseId) {
      return withCors(
        NextResponse.json(
          { error: allowed.length ? 'warehouse_id required or must be in your scope' : 'No warehouse access' },
          { status: 400, headers: h }
        ),
        req
      );
    }

    const productId = searchParams.get('id')?.trim();
    if (productId) {
      const product = await getProductById(warehouseId, productId);
      if (!product) {
        return withCors(NextResponse.json({ error: 'Product not found' }, { status: 404, headers: h }), req);
      }
      return withCors(NextResponse.json(product, { headers: h }), req);
    }

    /** Cap at 500 per request to avoid 504 on cold start + large list (Vercel function timeout). Use offset for pagination. */
    const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 500), 1), 500);
    const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0);
    const q = searchParams.get('q')?.trim() ?? undefined;
    const category = searchParams.get('category')?.trim() ?? undefined;
    const lowStock = searchParams.get('low_stock') === 'true' || searchParams.get('low_stock') === '1';
    const outOfStock = searchParams.get('out_of_stock') === 'true' || searchParams.get('out_of_stock') === '1';

    const { data, total } = await getWarehouseProducts(warehouseId, {
      limit,
      offset,
      q,
      category,
      lowStock: lowStock || undefined,
      outOfStock: outOfStock || undefined,
    });
    return withCors(NextResponse.json({ data, total }, { headers: h }), req);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load products';
    console.error('[GET /api/products]', message);
    return withCors(
      NextResponse.json({ error: message }, { status: 500, headers: h }),
      req
    );
  }
}

/** POST /api/products — create product (body: warehouseId, name, sku, ...). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return withCors(auth, req);

  const h = corsHeaders(req);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return withCors(NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: h }), req);
  }

  const bodyWarehouseId = String(body.warehouseId ?? body.warehouse_id ?? '').trim();
  const effectiveWarehouseId = await getEffectiveWarehouseId(auth, bodyWarehouseId || undefined, {
    path: req.nextUrl.pathname,
    method: 'POST',
  });
  if (!effectiveWarehouseId) {
    return withCors(
      NextResponse.json(
        { error: 'warehouseId is required and must be in your scope' },
        { status: 400, headers: h }
      ),
      req
    );
  }

  try {
    const created = await createWarehouseProduct({ ...body, warehouseId: effectiveWarehouseId });
    return withCors(NextResponse.json(created, { status: 201, headers: h }), req);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create product';
    console.error('[POST /api/products]', message);
    return withCors(
      NextResponse.json({ error: message }, { status: 400, headers: h }),
      req
    );
  }
}

/** PUT /api/products — update product (body: id, warehouseId, ...). */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return withCors(auth, req);

  const h = corsHeaders(req);
  let body: PutProductBody & { warehouseId?: string; warehouse_id?: string };
  try {
    body = await req.json();
  } catch {
    return withCors(NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: h }), req);
  }

  const productId = String(body.id ?? '').trim();
  const bodyWarehouseId = String(body.warehouseId ?? body.warehouse_id ?? '').trim();
  const effectiveWarehouseId = await getEffectiveWarehouseId(auth, bodyWarehouseId || undefined, {
    path: req.nextUrl.pathname,
    method: 'PUT',
  });
  if (!productId || !effectiveWarehouseId) {
    return withCors(
      NextResponse.json(
        { error: 'id and warehouseId are required and warehouse must be in your scope' },
        { status: 400, headers: h }
      ),
      req
    );
  }

  try {
    const updated = await updateWarehouseProduct(productId, effectiveWarehouseId, body);
    if (!updated) {
      return withCors(NextResponse.json({ error: 'Product not found' }, { status: 404, headers: h }), req);
    }
    return withCors(NextResponse.json(updated, { headers: h }), req);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update product';
    console.error('[PUT /api/products]', message);
    return withCors(NextResponse.json({ error: message }, { status: 400, headers: h }), req);
  }
}

/** DELETE /api/products — delete product. Query: id, warehouse_id. */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return withCors(auth, req);

  const h = corsHeaders(req);
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('id')?.trim();
  const queryWarehouseId = searchParams.get('warehouse_id')?.trim() ?? '';
  const scope = await getScopeForUser(auth.email);
  const allowed = scope.allowedWarehouseIds;
  const roleNorm = (auth.role ?? '').toLowerCase().replace(/\s+/g, '_');
  const isAdminNoScope = (roleNorm === 'admin' || roleNorm === 'super_admin') && allowed.length === 0;
  const warehouseId = queryWarehouseId
    ? (isAdminNoScope ? queryWarehouseId : (allowed.includes(queryWarehouseId) ? queryWarehouseId : ''))
    : (allowed[0] ?? '');

  if (!productId || !warehouseId) {
    return withCors(
      NextResponse.json(
        { error: 'id and warehouse_id are required and warehouse must be in your scope' },
        { status: 400, headers: h }
      ),
      req
    );
  }

  try {
    await deleteWarehouseProduct(productId, warehouseId);
    return withCors(NextResponse.json({ ok: true }, { headers: h }), req);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete product';
    console.error('[DELETE /api/products]', message);
    return withCors(NextResponse.json({ error: message }, { status: 400, headers: h }), req);
  }
}
