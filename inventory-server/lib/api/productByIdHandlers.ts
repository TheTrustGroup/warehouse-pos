/**
 * Shared handlers for GET/PUT/DELETE product by id.
 * Used by app/api/products/[id] and app/admin/api/products/[id].
 * Single implementation; routes differ only by auth (requireAuth vs requireAdmin) and CORS.
 *
 * warehouse_id contract:
 * - GET: query param warehouse_id required.
 * - PUT/DELETE: body warehouseId or warehouse_id (or query for DELETE); session can override via getEffectiveWarehouseId on public API.
 * - All product-by-id operations require an effective warehouse.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Session } from '@/lib/auth/session';
import {
  getWarehouseProductById,
  updateWarehouseProduct,
  deleteWarehouseProduct,
  ProductUpdateError,
  type PutProductBody,
} from '@/lib/data/warehouseProducts';
import { logDurability } from '@/lib/data/durabilityLogger';

function getRequestId(req: NextRequest): string {
  return req.headers.get('x-request-id')?.trim() || req.headers.get('x-correlation-id')?.trim() || crypto.randomUUID();
}

/** GET: warehouseId required (query). Returns 400 if missing, 404 if not found. */
export async function handleGetProductById(
  id: string,
  warehouseId: string
): Promise<NextResponse> {
  const wid = warehouseId?.trim();
  if (!wid) {
    return NextResponse.json({ error: 'warehouse_id required' }, { status: 400 });
  }
  try {
    const product = await getWarehouseProductById(id, wid);
    if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(product);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PUT: body must include warehouseId (or warehouse_id). Uses session for effective warehouse when applicable. */
export async function handlePutProductById(
  req: NextRequest,
  id: string,
  body: PutProductBody,
  warehouseId: string,
  auth: Session
): Promise<NextResponse> {
  const requestId = getRequestId(req);
  const effectiveBody: PutProductBody = { ...body, warehouseId, warehouse_id: warehouseId };
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
    return NextResponse.json(updated);
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
      return NextResponse.json({ error: e.message }, { status: e.status });
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE: warehouseId required (body or query). */
export async function handleDeleteProductById(
  req: NextRequest,
  id: string,
  warehouseId: string,
  auth: Session
): Promise<NextResponse> {
  const requestId = getRequestId(req);
  if (!warehouseId?.trim()) {
    return NextResponse.json({ error: 'warehouseId required' }, { status: 400 });
  }
  const wid = warehouseId.trim();
  try {
    await deleteWarehouseProduct(id, wid);
    logDurability({
      status: 'success',
      entity_type: 'product',
      entity_id: id,
      warehouse_id: wid,
      request_id: requestId,
      user_role: auth.role,
    });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logDurability({
      status: 'failed',
      entity_type: 'product',
      entity_id: id,
      warehouse_id: wid,
      request_id: requestId,
      user_role: auth.role,
      message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
