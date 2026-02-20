// ============================================================
// GET /api/products — list products with inventory for a warehouse
// Used by: POS (load products), inventory grid
//
// Query: warehouse_id (required), limit, in_stock, category
// Returns: { data: ProductRecord[] } — matches v_products_inventory
//          (quantityBySize populated for sized products)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getWarehouseProducts } from '../../../lib/data/warehouseProducts';

const CORS = {
  'Access-Control-Allow-Origin':  process.env.ALLOWED_ORIGIN ?? 'https://warehouse.extremedeptkidz.com',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-request-id',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
}

export async function GET(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) return unauthorized();

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get('warehouse_id') ?? '';
  const limit     = Math.min(Math.floor(Number(searchParams.get('limit') ?? 1000)), 2000);
  const inStock   = searchParams.get('in_stock') === 'true' || searchParams.get('in_stock') === '1';
  const category  = searchParams.get('category') ?? undefined;

  if (!warehouseId) {
    return NextResponse.json(
      { error: 'warehouse_id is required' },
      { status: 400, headers: CORS }
    );
  }

  try {
    const { data: products } = await getWarehouseProducts(warehouseId, {
      limit,
      inStock: inStock || undefined,
      category,
    });
    return NextResponse.json({ data: products }, { headers: CORS });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to load products';
    return NextResponse.json(
      { error: message },
      { status: 500, headers: CORS }
    );
  }
}
