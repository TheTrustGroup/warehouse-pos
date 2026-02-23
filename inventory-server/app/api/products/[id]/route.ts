/**
 * GET, PUT, DELETE /api/products/[id]
 * Public API: CORS, requireAuth (GET), requireAdmin (PUT, DELETE).
 * Implementation: lib/api/productByIdHandlers (shared with admin route).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, getEffectiveWarehouseId } from '@/lib/auth/session';
import { corsHeaders } from '@/lib/cors';
import { handleGetProductById, handlePutProductById, handleDeleteProductById } from '@/lib/api/productByIdHandlers';
import type { PutProductBody } from '@/lib/data/warehouseProducts';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  const h = corsHeaders(req);
  Object.entries(h).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return withCors(auth, req);
  const { id } = await ctx.params;
  const warehouseId = req.nextUrl.searchParams.get('warehouse_id') ?? '';
  const res = await handleGetProductById(id, warehouseId);
  return withCors(res, req);
}

export async function PUT(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return withCors(auth, req);
  const { id } = await ctx.params;
  let body: PutProductBody;
  try {
    body = (await req.json()) as PutProductBody;
  } catch {
    return withCors(NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }), req);
  }
  const bodyWarehouseId = String(body.warehouseId ?? body.warehouse_id ?? '').trim();
  const warehouseId = await getEffectiveWarehouseId(auth, bodyWarehouseId || undefined, {
    path: req.nextUrl.pathname,
    method: 'PUT',
  });
  if (!warehouseId) {
    return withCors(NextResponse.json({ error: 'warehouseId required' }, { status: 400 }), req);
  }
  const res = await handlePutProductById(req, id, body, warehouseId, auth);
  return withCors(res, req);
}

export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return withCors(auth, req);
  const { id } = await ctx.params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* body optional */
  }
  const bodyWarehouseId = String(
    body.warehouseId ?? body.warehouse_id ?? req.nextUrl.searchParams.get('warehouse_id') ?? ''
  ).trim();
  const warehouseId = await getEffectiveWarehouseId(auth, bodyWarehouseId || undefined, {
    path: req.nextUrl.pathname,
    method: 'DELETE',
  });
  if (!warehouseId) {
    return withCors(NextResponse.json({ error: 'warehouseId required' }, { status: 400 }), req);
  }
  const res = await handleDeleteProductById(req, id, warehouseId, auth);
  return withCors(res, req);
}
