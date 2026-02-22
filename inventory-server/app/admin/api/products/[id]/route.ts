/**
 * GET, PUT, DELETE /admin/api/products/[id]
 * Admin surface: same behavior as /api/products/[id]; requireAdmin for all methods.
 * Implementation: lib/api/productByIdHandlers (shared with public API).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { handleGetProductById, handlePutProductById, handleDeleteProductById } from '@/lib/api/productByIdHandlers';
import type { PutProductBody } from '@/lib/data/warehouseProducts';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const warehouseId = request.nextUrl.searchParams.get('warehouse_id')?.trim() ?? '';
  return handleGetProductById(id, warehouseId);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  let body: PutProductBody;
  try {
    body = (await request.json()) as PutProductBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const warehouseId = String(body.warehouseId ?? body.warehouse_id ?? '').trim();
  if (!warehouseId) {
    return NextResponse.json({ error: 'warehouseId required' }, { status: 400 });
  }
  return handlePutProductById(request, id, body, warehouseId, auth);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* body optional */
  }
  const warehouseId = String(
    body.warehouseId ?? body.warehouse_id ?? new URL(request.url).searchParams.get('warehouse_id') ?? ''
  ).trim();
  return handleDeleteProductById(request, id, warehouseId, auth);
}
