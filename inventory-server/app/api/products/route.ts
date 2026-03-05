/**
 * GET /api/products — list products for a warehouse (Inventory + POS).
 * Query: warehouse_id (required), limit, offset, q, category, low_stock, out_of_stock.
 * Auth: Bearer or session cookie; warehouse_id must be in user scope (or admin with no scope).
 */
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { getRequestId, jsonError } from '../../../lib/apiResponse';
import { logApiResponse } from '../../../lib/requestLog';
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
import { notifyInventoryUpdated } from '@/lib/cache/dashboardStatsCache';

export const dynamic = 'force-dynamic';
/** Higher than DB statement_timeout (10s) so we return a clean 504/503 instead of Vercel 504. Requires Vercel Pro for >10s. */
export const maxDuration = 30;

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  const h = corsHeaders(req);
  Object.entries(h).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

/** Request-level timeout so we respond before gateway 504. */
const PRODUCTS_GET_TIMEOUT_MS = 25_000;
const PRODUCTS_QUERY_TIMEOUT_MS = 20_000;

function isStatementTimeoutError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /statement timeout|canceling statement due to statement timeout|query timeout|abort/i.test(msg);
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const start = Date.now();
  const requestId = getRequestId(req);
  const h = corsHeaders(req);
  const fail = (status: number, message: string, code?: string): NextResponse => {
    logApiResponse(req, status, Date.now() - start, { message, code });
    return withCors(jsonError(status, message, { code, requestId, headers: h }), req);
  };
  const logAndReturn = (res: NextResponse): NextResponse => {
    logApiResponse(req, res.status, Date.now() - start);
    return res;
  };

  const timeoutPromise = new Promise<NextResponse>((_, reject) => {
    setTimeout(() => reject(new Error('PRODUCTS_GET_TIMEOUT')), PRODUCTS_GET_TIMEOUT_MS);
  });

  const work = async (): Promise<NextResponse> => {
    try {
      if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        return fail(500, 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in Vercel project environment variables.');
      }

      const auth = await requireAuth(req);
      if (auth instanceof NextResponse) return withCors(auth, req);

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
        return logAndReturn(
          withCors(
            NextResponse.json(
              { error: allowed.length ? 'warehouse_id required or must be in your scope' : 'No warehouse access' },
              { status: 400, headers: h }
            ),
            req
          )
        );
      }

      const productId = searchParams.get('id')?.trim();
      if (productId) {
        const product = await getProductById(warehouseId, productId);
        if (!product) {
          return logAndReturn(
            withCors(NextResponse.json({ error: 'Product not found' }, { status: 404, headers: h }), req)
          );
        }
        const singleRes = NextResponse.json(product, { headers: h });
        singleRes.headers.set('Cache-Control', 'private, no-store, max-age=0');
        return logAndReturn(withCors(singleRes, req));
      }

      /** Cap at 250 per request to stay under Vercel function timeout (cold start + Supabase). Use offset for pagination. */
      const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 250), 1), 250);
      const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0);
      const q = searchParams.get('q')?.trim() ?? undefined;
      const category = searchParams.get('category')?.trim() ?? undefined;
      const lowStock = searchParams.get('low_stock') === 'true' || searchParams.get('low_stock') === '1';
      const outOfStock = searchParams.get('out_of_stock') === 'true' || searchParams.get('out_of_stock') === '1';

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PRODUCTS_QUERY_TIMEOUT_MS);
      try {
        const result = await getWarehouseProducts(warehouseId, {
          limit,
          offset,
          q,
          category,
          lowStock: lowStock || undefined,
          outOfStock: outOfStock || undefined,
          signal: controller.signal,
        });
        const res = NextResponse.json({ data: result.data, total: result.total }, { headers: h });
        res.headers.set('Cache-Control', 'private, no-store, max-age=0');
        res.headers.set('X-Content-Type-Options', 'nosniff');
        return logAndReturn(withCors(res, req));
      } catch (e) {
        const isAbortOrTimeout =
          (e instanceof Error && e.name === 'AbortError') || isStatementTimeoutError(e);
        if (isAbortOrTimeout) {
          logApiResponse(req, 503, Date.now() - start, { message: 'Query timed out', code: 'QUERY_TIMEOUT' });
          return withCors(
            jsonError(503, 'Products list is taking too long. Please try again.', {
              code: 'QUERY_TIMEOUT',
              requestId,
              headers: { ...h, 'Retry-After': '15' },
            }),
            req
          );
        }
        throw e;
      } finally {
        clearTimeout(timeout);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load products';
      console.error('[GET /api/products]', message);
      if (isStatementTimeoutError(e)) {
        logApiResponse(req, 503, Date.now() - start, { message: 'Query timed out', code: 'QUERY_TIMEOUT' });
        return withCors(
          jsonError(503, 'Query timed out. The request took too long. Please try again or use a smaller limit/offset.', {
            code: 'QUERY_TIMEOUT',
            requestId,
            headers: { ...h, 'Retry-After': '60' },
          }),
          req
        );
      }
      return fail(500, message);
    }
  };

  try {
    return await Promise.race([work(), timeoutPromise]);
  } catch (e) {
    if (e instanceof Error && e.message === 'PRODUCTS_GET_TIMEOUT') {
      logApiResponse(req, 503, Date.now() - start, { message: 'Request timed out', code: 'REQUEST_TIMEOUT' });
      return withCors(
        jsonError(503, 'Products request timed out. Please try again.', {
          code: 'REQUEST_TIMEOUT',
          requestId,
          headers: { ...h, 'Retry-After': '15' },
        }),
        req
      );
    }
    throw e;
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
    await notifyInventoryUpdated(effectiveWarehouseId);
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

  // Normalize array fields so backend never receives scalars (avoids type errors in DB/RPC).
  const normalizedBody: PutProductBody & { warehouseId?: string; warehouse_id?: string } = {
    ...body,
    tags: Array.isArray(body.tags) ? body.tags : [],
    images: Array.isArray(body.images) ? body.images : [],
    quantityBySize: Array.isArray(body.quantityBySize) ? body.quantityBySize : undefined,
  };

  try {
    const updated = await updateWarehouseProduct(productId, effectiveWarehouseId, normalizedBody);
    if (!updated) {
      return withCors(NextResponse.json({ error: 'Product not found' }, { status: 404, headers: h }), req);
    }
    await notifyInventoryUpdated(effectiveWarehouseId);
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
    await notifyInventoryUpdated(warehouseId);
    return withCors(NextResponse.json({ ok: true }, { headers: h }), req);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete product';
    console.error('[DELETE /api/products]', message);
    return withCors(NextResponse.json({ error: message }, { status: 400, headers: h }), req);
  }
}
