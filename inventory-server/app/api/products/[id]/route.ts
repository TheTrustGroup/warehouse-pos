/**
 * GET, PUT, DELETE /api/products/[id]
 * Single source of truth: delegates to lib/data/warehouseProducts.
 * Auth: requireAuth (GET), requireAdmin (PUT, DELETE). CORS and durability logging applied.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getWarehouseProductById,
  updateWarehouseProduct,
  deleteWarehouseProduct,
  ProductUpdateError,
} from '@/lib/data/warehouseProducts';
import { requireAuth, requireAdmin, getEffectiveWarehouseId } from '@/lib/auth/session';
import { corsHeaders } from '@/lib/cors';
import { logDurability } from '@/lib/data/durabilityLogger';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

function getRequestId(req: NextRequest): string {
  return req.headers.get('x-request-id')?.trim() || req.headers.get('x-correlation-id')?.trim() || crypto.randomUUID();
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

// ── GET /api/products/[id] ─────────────────────────────────────────────────

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const h = corsHeaders(req);
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) {
    const res = auth;
    Object.entries(h).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }

  const { id } = await ctx.params;
  const warehouseId = req.nextUrl.searchParams.get('warehouse_id') ?? '';

  if (!warehouseId.trim()) {
    return NextResponse.json({ error: 'warehouse_id required' }, { status: 400, headers: h });
  }

  try {
    const product = await getWarehouseProductById(id, warehouseId.trim());
    if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: h });
    return NextResponse.json(product, { headers: h });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500, headers: h });
  }
}

// ── PUT /api/products/[id] ─────────────────────────────────────────────────

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const h = corsHeaders(req);
  const auth = requireAdmin(req);
  if (auth instanceof NextResponse) {
    Object.entries(h).forEach(([k, v]) => auth.headers.set(k, v));
    return auth;
  }

  const { id } = await ctx.params;
  const requestId = getRequestId(req);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: h });
  }

  const bodyWarehouseId = String(body.warehouseId ?? body.warehouse_id ?? '').trim();
  const warehouseId = getEffectiveWarehouseId(auth, bodyWarehouseId || undefined, {
    path: req.nextUrl.pathname,
    method: 'PUT',
  });
  if (!warehouseId) {
    return NextResponse.json({ error: 'warehouseId required' }, { status: 400, headers: h });
  }

  const effectiveBody = { ...body, warehouseId, warehouse_id: warehouseId };

  try {
    const updated = await updateWarehouseProduct(id, effectiveBody);
    logDurability({
      status: 'success',
      entity_type: 'product',
      entity_id: id,
      warehouse_id: warehouseId,
      request_id: requestId,
      user_role: auth.role,
    });
    return NextResponse.json(updated, { headers: h });
  } catch (e) {
    if (e instanceof ProductUpdateError) {
      logDurability({
        status: 'failed',
        entity_type: 'product',
        entity_id: id,
        warehouse_id: warehouseId,
        request_id: requestId,
        user_role: auth.role,
        message: e.message,
      });
      return NextResponse.json({ error: e.message }, { status: e.status, headers: h });
    }
    const message = e instanceof Error ? e.message : 'Unknown error';
    logDurability({
      status: 'failed',
      entity_type: 'product',
      entity_id: id,
      warehouse_id: warehouseId,
      request_id: requestId,
      user_role: auth.role,
      message,
    });
    return NextResponse.json({ error: message }, { status: 500, headers: h });
  }
}

// ── DELETE /api/products/[id] ──────────────────────────────────────────────

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const h = corsHeaders(req);
  const auth = requireAdmin(req);
  if (auth instanceof NextResponse) {
    Object.entries(h).forEach(([k, v]) => auth.headers.set(k, v));
    return auth;
  }

  const { id } = await ctx.params;
  const requestId = getRequestId(req);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* body optional */
  }
  const bodyWarehouseId = String(
    body.warehouseId ?? body.warehouse_id ?? req.nextUrl.searchParams.get('warehouse_id') ?? ''
  ).trim();
  const warehouseId = getEffectiveWarehouseId(auth, bodyWarehouseId || undefined, {
    path: req.nextUrl.pathname,
    method: 'DELETE',
  });
  if (!warehouseId) {
    return NextResponse.json({ error: 'warehouseId required' }, { status: 400, headers: h });
  }

  try {
    await deleteWarehouseProduct(id, warehouseId);
    logDurability({
      status: 'success',
      entity_type: 'product',
      entity_id: id,
      warehouse_id: warehouseId,
      request_id: requestId,
      user_role: auth.role,
    });
    return NextResponse.json({ success: true }, { headers: h });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logDurability({
      status: 'failed',
      entity_type: 'product',
      entity_id: id,
      warehouse_id: warehouseId,
      request_id: requestId,
      user_role: auth.role,
      message,
    });
    return NextResponse.json({ error: message }, { status: 500, headers: h });
  }
}
