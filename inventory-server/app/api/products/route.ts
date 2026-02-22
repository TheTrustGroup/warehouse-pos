// GET + POST /api/products — thin route: CORS, auth, delegate to lib
// GET Query: warehouse_id (required), limit, category, in_stock
// POST Body: product fields + warehouseId; sizeKind + quantityBySize for sized

import { NextRequest, NextResponse } from 'next/server';
import {
  getWarehouseProducts,
  createWarehouseProduct,
} from '@/lib/data/warehouseProducts';
import { getScopeForUser } from '@/lib/data/userScopes';
import { requireAuth, requireAdmin } from '@/lib/auth/session';
import { corsHeaders } from '@/lib/cors';

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(req: NextRequest) {
  const h = corsHeaders(req);
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) {
    Object.entries(h).forEach(([k, v]) => auth.headers.set(k, v));
    return auth;
  }
  const sp = new URL(req.url).searchParams;
  const warehouseId = sp.get('warehouse_id') ?? '';
  const limit = Math.min(Number(sp.get('limit') ?? 1000), 2000);
  const category = sp.get('category') ?? undefined;
  const inStock = sp.get('in_stock') === 'true';

  if (!warehouseId) {
    return NextResponse.json(
      { error: 'warehouse_id required' },
      { status: 400, headers: h }
    );
  }

  const scope = await getScopeForUser(auth.email);
  if (scope.allowedWarehouseIds.length > 0 && !scope.allowedWarehouseIds.includes(warehouseId)) {
    return NextResponse.json(
      { error: 'Forbidden: you do not have access to this warehouse' },
      { status: 403, headers: h }
    );
  }

  try {
    const { data } = await getWarehouseProducts(warehouseId, {
      limit,
      offset: 0,
      inStock,
      category,
    });
    const res = NextResponse.json({ data }, { headers: h });
    res.headers.set('X-Warehouse-Id', warehouseId);
    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/products]', err);
    return NextResponse.json({ error: message }, { status: 500, headers: h });
  }
}

export async function POST(req: NextRequest) {
  const h = corsHeaders(req);
  const auth = requireAdmin(req);
  if (auth instanceof NextResponse) {
    Object.entries(h).forEach(([k, v]) => auth.headers.set(k, v));
    return auth;
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: h });
  }

  const warehouseId = String(body.warehouseId ?? body.warehouse_id ?? '').trim();
  if (!warehouseId) {
    return NextResponse.json(
      { error: 'warehouseId required' },
      { status: 400, headers: h }
    );
  }

  const scope = await getScopeForUser(auth.email);
  if (scope.allowedWarehouseIds.length > 0 && !scope.allowedWarehouseIds.includes(warehouseId)) {
    return NextResponse.json(
      { error: 'Forbidden: you do not have access to this warehouse' },
      { status: 403, headers: h }
    );
  }

  try {
    const created = await createWarehouseProduct(body);
    return NextResponse.json(created, { status: 201, headers: h });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[POST /api/products]', err);
    return NextResponse.json({ error: message }, { status: 500, headers: h });
  }
}
