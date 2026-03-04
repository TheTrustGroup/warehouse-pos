// ============================================================
// Required catch-all: /api/products/[:id] — same behavior as [id].
// Uses [...id] so Vercel reliably routes /api/products/:id (avoids 404).
// GET, PUT, PATCH, DELETE /api/products/:id
// Security: requireAuth (GET) / requireAdmin (PUT/PATCH/DELETE), warehouse scope enforced.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { corsHeaders } from '@/lib/cors';
import { requireAuth, requireAdmin, getEffectiveWarehouseId } from '@/lib/auth/session';
import { isValidId } from '@/lib/validation';

function withCors(res: NextResponse, req: NextRequest): NextResponse {
  const h = corsHeaders(req);
  Object.entries(h).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

type RouteCtx = { params: { id: string[] } | Promise<{ id: string[] }> };

async function getId(ctx: RouteCtx): Promise<string> {
  const p = await Promise.resolve(ctx.params);
  const arr = p.id;
  if (!Array.isArray(arr) || arr.length !== 1) return '';
  return arr[0]?.trim() ?? '';
}

export const dynamic = 'force-dynamic';

interface SizeEntry {
  sizeCode:  string;
  sizeLabel: string;
  quantity:  number;
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return withCors(auth, req);

  const id = await getId(ctx);
  if (!id)
    return withCors(NextResponse.json({ error: 'Missing product id' }, { status: 400 }), req);
  if (!isValidId(id))
    return withCors(NextResponse.json({ error: 'Invalid product id' }, { status: 400 }), req);

  const queryWarehouseId = req.nextUrl.searchParams.get('warehouse_id')?.trim() ?? undefined;
  const effectiveWarehouseId = await getEffectiveWarehouseId(auth, queryWarehouseId);
  if (!effectiveWarehouseId)
    return withCors(
      NextResponse.json({ error: 'warehouse_id is required and must be in your scope' }, { status: 400 }),
      req
    );
  if (queryWarehouseId && queryWarehouseId !== effectiveWarehouseId)
    return withCors(
      NextResponse.json({ error: 'You do not have access to this warehouse' }, { status: 403 }),
      req
    );
  if (!isValidId(effectiveWarehouseId))
    return withCors(NextResponse.json({ error: 'Invalid warehouse_id' }, { status: 400 }), req);

  try {
    const db = getSupabase();
    const product = await fetchOne(db, id, effectiveWarehouseId);
    if (!product)
      return withCors(NextResponse.json({ error: 'Product not found' }, { status: 404 }), req);
    return withCors(NextResponse.json(product), req);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[GET /api/products/:id]', msg);
    return withCors(NextResponse.json({ error: msg }, { status: 500 }), req);
  }
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  return handleUpdate(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  return handleUpdate(req, ctx);
}

async function handleUpdate(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return withCors(auth, req);

  const id = await getId(ctx);
  if (!id)
    return withCors(NextResponse.json({ error: 'Missing product id in URL' }, { status: 400 }), req);
  if (!isValidId(id))
    return withCors(NextResponse.json({ error: 'Invalid product id' }, { status: 400 }), req);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return withCors(NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 }), req);
  }

  const bodyWarehouseId = String(body.warehouseId ?? body.warehouse_id ?? '').trim();
  const wid = await getEffectiveWarehouseId(auth, bodyWarehouseId || undefined);
  if (!wid)
    return withCors(
      NextResponse.json({ error: 'warehouseId is required and must be in your scope' }, { status: 400 }),
      req
    );
  if (!isValidId(wid))
    return withCors(NextResponse.json({ error: 'Invalid warehouseId' }, { status: 400 }), req);

  try {
    const db = getSupabase();
    const now = new Date().toISOString();

    // Look up product: try (id, warehouse_id) first for multi-warehouse schema; then by id only (single row per product).
    let existing: { id?: string; version?: number; size_kind?: string } | null = null;
    const { data: byWarehouse, error: fetchErr } = await db
      .from('warehouse_products')
      .select('id, version, size_kind')
      .eq('id', id)
      .eq('warehouse_id', wid)
      .maybeSingle();

    if (byWarehouse) {
      existing = byWarehouse as { id?: string; version?: number; size_kind?: string };
    }
    if (!existing && (fetchErr?.code === 'PGRST116' || !byWarehouse)) {
      const { data: byId } = await db
        .from('warehouse_products')
        .select('id, version, size_kind')
        .eq('id', id)
        .maybeSingle();
      if (byId) existing = byId as { id?: string; version?: number; size_kind?: string };
    }

    if (!existing) {
      return withCors(
        NextResponse.json({ error: `Product ${id} not found in warehouse ${wid}` }, { status: 404 }),
        req
      );
    }

    const existingRow = existing as { version?: number; size_kind?: string };
    const currentVersion = Number(existingRow.version ?? 0);
    const sizeKind       = normSK(body, existingRow.size_kind ?? '');
    const rawSizes       = parseRawSizes(body);

    const singleOneSize =
      sizeKind === 'sized' &&
      rawSizes.length === 1 &&
      /^ONE_?SIZE$/i.test(rawSizes[0]?.sizeCode ?? '');

    const effectiveSK = singleOneSize ? 'one_size' : sizeKind;
    const validSizes  = effectiveSK === 'sized' ? filterSizes(rawSizes) : [];

    let sizesToWrite: Array<{ sizeCode: string; quantity: number }> | null;
    let totalQty: number;

    if (singleOneSize) {
      sizesToWrite = [];
      totalQty     = rawSizes[0].quantity;
    } else if (effectiveSK === 'sized') {
      if (validSizes.length > 0) {
        sizesToWrite = validSizes;
        totalQty     = validSizes.reduce((s, r) => s + r.quantity, 0);
      } else {
        sizesToWrite = null;
        const { data: cur } = await db
          .from('warehouse_inventory_by_size')
          .select('quantity')
          .eq('warehouse_id', wid)
          .eq('product_id', id);
        totalQty = (cur ?? []).reduce((s: number, r: { quantity?: number }) => s + Number(r.quantity ?? 0), 0);
      }
    } else {
      sizesToWrite = [];
      totalQty     = Number(body.quantity ?? 0);
    }

    const productRow = buildRow(body, id, wid, effectiveSK, now, currentVersion + 1);

    const { error: rpcErr } = await db.rpc('update_warehouse_product_atomic', {
      p_id:               id,
      p_warehouse_id:     wid,
      p_row:              productRow,
      p_current_version:  currentVersion,
      p_quantity:         totalQty,
      p_quantity_by_size: sizesToWrite !== null ? JSON.stringify(sizesToWrite) : null,
    });

    if (rpcErr) {
      if (rpcErr.code === '42883' || rpcErr.message?.includes('does not exist')) {
        await manualUpdate(db, id, wid, productRow, totalQty, sizesToWrite, now);
      } else       if (rpcErr.message?.includes('someone else') || rpcErr.code === 'P0001') {
        return withCors(
          NextResponse.json(
            { error: 'This product was modified by someone else. Please refresh and try again.' },
            { status: 409 }
          ),
          req
        );
      } else {
        console.error('[PUT /api/products/:id] RPC error:', rpcErr.code, rpcErr.message);
        return withCors(NextResponse.json({ error: rpcErr.message }, { status: 500 }), req);
      }
    }

    const updated = await fetchOne(db, id, wid);
    if (!updated)
      return withCors(NextResponse.json({ error: 'Product not found after update' }, { status: 404 }), req);

    const qtyBySize = Array.isArray(updated.quantityBySize) ? updated.quantityBySize : [];
    if (sizesToWrite && sizesToWrite.length > 0 && qtyBySize.length === 0) {
      updated.quantityBySize = sizesToWrite.map(r => ({
        sizeCode: r.sizeCode, sizeLabel: r.sizeCode, quantity: r.quantity,
      }));
      updated.quantity = totalQty;
    }

    return withCors(NextResponse.json(updated), req);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    console.error('[PUT /api/products/:id] unhandled error:', msg);
    return withCors(NextResponse.json({ error: msg }, { status: 500 }), req);
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return withCors(auth, req);

  const id = await getId(ctx);
  if (!id)
    return withCors(NextResponse.json({ error: 'Missing product id' }, { status: 400 }), req);
  if (!isValidId(id))
    return withCors(NextResponse.json({ error: 'Invalid product id' }, { status: 400 }), req);

  let rawWid = req.nextUrl.searchParams.get('warehouse_id')?.trim() ?? '';
  if (!rawWid) {
    try {
      const body = (await req.json()) as Record<string, unknown>;
      rawWid = String(body.warehouseId ?? body.warehouse_id ?? '').trim();
    } catch { /* body optional for DELETE */ }
  }

  const wid = await getEffectiveWarehouseId(auth, rawWid || undefined);
  if (!wid)
    return withCors(
      NextResponse.json({ error: 'warehouseId is required and must be in your scope' }, { status: 400 }),
      req
    );
  if (!isValidId(wid))
    return withCors(NextResponse.json({ error: 'Invalid warehouseId' }, { status: 400 }), req);

  try {
    const db = getSupabase();
    await db.from('warehouse_inventory_by_size').delete()
      .eq('warehouse_id', wid).eq('product_id', id);
    await db.from('warehouse_inventory').delete()
      .eq('warehouse_id', wid).eq('product_id', id);

    const { error } = await db.from('warehouse_products').delete()
      .eq('id', id).eq('warehouse_id', wid);

    if (error)
      return withCors(NextResponse.json({ error: error.message }, { status: 500 }), req);

    return withCors(NextResponse.json({ success: true, id }), req);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[DELETE /api/products/:id]', msg);
    return withCors(NextResponse.json({ error: msg }, { status: 500 }), req);
  }
}

type DB = ReturnType<typeof getSupabase>;

/** Select list when warehouse_products has no warehouse_id (one row per product). */
const PRODUCT_SELECT = `
  id, sku, barcode, name, description, category,
  size_kind, selling_price, cost_price, reorder_level,
  location, supplier, tags, images, version, created_at, updated_at
`;

async function fetchOne(db: DB, id: string, wid: string) {
  const { data: p } = await db
    .from('warehouse_products')
    .select(PRODUCT_SELECT)
    .eq('id', id)
    .single();

  if (!p) return null;

  const { data: invRow } = await db
    .from('warehouse_inventory')
    .select('quantity')
    .eq('warehouse_id', wid)
    .eq('product_id', id)
    .maybeSingle();

  const { data: sd } = await db
    .from('warehouse_inventory_by_size')
    .select('size_code, quantity, size_codes!left(size_label, sort_order)')
    .eq('warehouse_id', wid)
    .eq('product_id', id);

  const sizes: SizeEntry[] = ((sd ?? []) as Array<{ size_code: string; quantity: number; size_codes?: { size_label?: string } | null }>)
    .map(r => ({
      sizeCode:  String(r.size_code),
      sizeLabel: String(r.size_codes?.size_label ?? r.size_code),
      quantity:  Number(r.quantity ?? 0),
    }))
    .sort((a, b) => a.sizeCode.localeCompare(b.sizeCode));

  const pAny = p as Record<string, unknown>;
  const isSized = (pAny.size_kind as string) === 'sized' && sizes.length > 0;
  const qty = isSized
    ? sizes.reduce((s, r) => s + r.quantity, 0)
    : Number((invRow as { quantity?: number } | null)?.quantity ?? 0);

  return toShape({ ...pAny, warehouse_id: wid }, qty, sizes);
}

async function manualUpdate(
  db: DB, id: string, wid: string,
  row: Record<string, unknown>, qty: number,
  sizeRows: Array<{ sizeCode: string; quantity: number }> | null,
  now: string
) {
  // Update by id only so it works when warehouse_products has no warehouse_id (one row per product).
  const { warehouse_id: _omit, ...rowWithoutWarehouse } = row as Record<string, unknown> & { warehouse_id?: string };
  void _omit;
  const { error: upErr } = await db
    .from('warehouse_products')
    .update(rowWithoutWarehouse)
    .eq('id', id);

  if (upErr) throw new Error(`Failed to update product: ${upErr.message}`);

  await db.from('warehouse_inventory').upsert(
    { warehouse_id: wid, product_id: id, quantity: qty, updated_at: now },
    { onConflict: 'warehouse_id,product_id' }
  );

  if (sizeRows !== null) {
    await db.from('warehouse_inventory_by_size').delete()
      .eq('warehouse_id', wid).eq('product_id', id);

    if (sizeRows.length > 0) {
      const { error: insErr } = await db.from('warehouse_inventory_by_size').insert(
        sizeRows.map(r => ({
          warehouse_id: wid, product_id: id,
          size_code: r.sizeCode, quantity: r.quantity,
          updated_at: now,
        }))
      );
      if (insErr) throw new Error(`Failed to save sizes: ${insErr.message}`);
    }
  }
}

function toShape(row: Record<string, unknown>, quantity: number, sizes: SizeEntry[]) {
  return {
    id:           String(row.id ?? ''),
    warehouseId:  String(row.warehouse_id ?? ''),
    sku:          String(row.sku ?? ''),
    barcode:      row.barcode ?? null,
    name:         String(row.name ?? ''),
    description:  row.description ?? null,
    category:     String(row.category ?? ''),
    sizeKind:     String(row.size_kind ?? 'na'),
    sellingPrice: Number(row.selling_price ?? 0),
    costPrice:    Number(row.cost_price ?? 0),
    reorderLevel: Number(row.reorder_level ?? 0),
    quantity,
    quantityBySize: sizes,
    location:     row.location ?? null,
    supplier:     row.supplier ?? null,
    tags:         Array.isArray(row.tags)   ? row.tags   : [],
    images:       Array.isArray(row.images) ? row.images : [],
    version:      Number(row.version ?? 0),
    createdAt:    String(row.created_at  ?? ''),
    updatedAt:    String(row.updated_at  ?? ''),
  };
}

function buildRow(
  b: Record<string, unknown>, id: string, wid: string,
  sk: string, now: string, version: number
) {
  return {
    id,
    warehouse_id:  wid,
    sku:           String(b.sku ?? '').trim(),
    barcode:       b.barcode ? String(b.barcode).trim() : null,
    name:          String(b.name ?? '').trim(),
    description:   b.description ? String(b.description).trim() : null,
    category:      String(b.category ?? '').trim(),
    size_kind:     sk,
    selling_price: Number(b.sellingPrice ?? b.selling_price ?? 0),
    cost_price:    Number(b.costPrice    ?? b.cost_price    ?? 0),
    reorder_level: Number(b.reorderLevel ?? b.reorder_level ?? 0),
    location:      b.location  ?? null,
    supplier:      b.supplier  ?? null,
    tags:          Array.isArray(b.tags)   ? b.tags   : [],
    images:        Array.isArray(b.images) ? b.images : [],
    version,
    updated_at: now,
  };
}

function normSK(b: Record<string, unknown>, fallback: string): string {
  const raw = String(b.sizeKind ?? b.size_kind ?? fallback ?? 'na').toLowerCase().trim();
  if (raw === 'sized')    return 'sized';
  if (raw === 'one_size') return 'one_size';
  return 'na';
}

function parseRawSizes(b: Record<string, unknown>): Array<{ sizeCode: string; quantity: number }> {
  const arr = (b.quantityBySize ?? b.quantity_by_size) as Array<{ sizeCode?: string; size_code?: string; quantity?: number }> | undefined;
  if (!Array.isArray(arr)) return [];
  return arr.map(r => ({
    sizeCode: String(r.sizeCode ?? r.size_code ?? '').trim().toUpperCase().replace(/\s+/g, ''),
    quantity: Math.max(0, Math.floor(Number(r.quantity ?? 0))),
  }));
}

function filterSizes(rows: Array<{ sizeCode: string; quantity: number }>) {
  return rows.filter(r =>
    r.sizeCode && r.sizeCode !== 'NA' && !/^ONE_?SIZE$/i.test(r.sizeCode)
  );
}
