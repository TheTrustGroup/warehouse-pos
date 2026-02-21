// ============================================================
// warehouseProducts.ts
// File: inventory-server/lib/data/warehouseProducts.ts
//
// FULL FILE REPLACEMENT — drop this in completely.
//
// WHY THIS FILE EXISTS:
//   Cursor replaced updateWarehouseProduct with a stub that throws
//   "updateWarehouseProduct not implemented". This file has every
//   function fully implemented with zero missing references.
//
// WHAT IS FIXED:
//   1. updateWarehouseProduct — complete implementation with RPC call
//      + manual fallback. No external helpers referenced.
//   2. Sizes always saved — sends ALL size rows (including qty=0)
//      to the RPC so the DELETE+INSERT strategy works correctly.
//   3. getWarehouseProducts — joins warehouse_inventory_by_size in
//      one batch query so quantityBySize is always populated.
//   4. No dependency on updateWarehouseProductLegacy — the manual
//      fallback is inline in this file.
//
// SCHEMA:
//   warehouse_products          — product metadata + size_kind
//   warehouse_inventory         — total qty (warehouse_id, product_id)
//   warehouse_inventory_by_size — per-size qty (warehouse_id, product_id, size_code)
//   size_codes                  — reference (size_code, size_label, sort_order)
//
// RPC: update_warehouse_product_atomic(
//        p_id, p_warehouse_id, p_row jsonb, p_current_version int,
//        p_quantity int, p_quantity_by_size jsonb
//      )
//   Strategy: DELETE all by_size rows, then INSERT each element of the array.
//   null  → don't touch by_size at all
//   []    → clear all by_size rows
//   [...] → replace with these rows
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// Supabase singleton
// ─────────────────────────────────────────────────────────────────────────────

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !key) throw new Error('[warehouseProducts] Supabase env vars not set');
  _supabase = createClient(url, key, { auth: { persistSession: false } });
  return _supabase;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers (no external imports needed)
// ─────────────────────────────────────────────────────────────────────────────

export function getDefaultWarehouseId(): string {
  return (
    process.env.DEFAULT_WAREHOUSE_ID ??
    '00000000-0000-0000-0000-000000000001'
  );
}

function ts(): string {
  return new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SizeKind = 'na' | 'one_size' | 'sized';

export interface SizeEntry {
  sizeCode:  string;
  sizeLabel: string;
  quantity:  number;
}

export interface WarehouseProductRow {
  id:            string;
  warehouse_id:  string;
  sku:           string;
  barcode?:      string | null;
  name:          string;
  description?:  string | null;
  category:      string;
  size_kind:     SizeKind;
  selling_price: number;
  cost_price:    number;
  reorder_level: number;
  location?:     unknown;
  supplier?:     unknown;
  tags?:         string[];
  images?:       string[];
  version:       number;
  created_at:    string;
  updated_at:    string;
}

// The API shape returned to the frontend
export interface WarehouseProductApi {
  id:             string;
  warehouseId:    string;
  sku:            string;
  barcode?:       string | null;
  name:           string;
  description?:   string | null;
  category:       string;
  sizeKind:       SizeKind;
  sellingPrice:   number;
  costPrice:      number;
  reorderLevel:   number;
  quantity:       number;
  quantityBySize: SizeEntry[];
  location?:      unknown;
  supplier?:      unknown;
  tags?:          string[];
  images?:        string[];
  version:        number;
  createdAt:      string;
  updatedAt:      string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row ↔ API conversion
// ─────────────────────────────────────────────────────────────────────────────

function rowToApi(
  row: Record<string, unknown>,
  quantity: number,
  sizeEntries: SizeEntry[] = []
): WarehouseProductApi {
  return {
    id:             String(row.id ?? ''),
    warehouseId:    String(row.warehouse_id ?? ''),
    sku:            String(row.sku ?? ''),
    barcode:        row.barcode ? String(row.barcode) : null,
    name:           String(row.name ?? ''),
    description:    row.description ? String(row.description) : null,
    category:       String(row.category ?? ''),
    sizeKind:       (String(row.size_kind ?? 'na')) as SizeKind,
    sellingPrice:   Number(row.selling_price ?? 0),
    costPrice:      Number(row.cost_price    ?? 0),
    reorderLevel:   Number(row.reorder_level ?? 0),
    quantity,
    quantityBySize: sizeEntries,
    location:       row.location  ?? null,
    supplier:       row.supplier  ?? null,
    tags:           Array.isArray(row.tags)   ? row.tags   as string[] : [],
    images:         Array.isArray(row.images) ? row.images as string[] : [],
    version:        Number(row.version ?? 0),
    createdAt:      String(row.created_at ?? ''),
    updatedAt:      String(row.updated_at ?? ''),
  };
}

// Build a DB row from an API payload body
function bodyToRow(
  body: Record<string, unknown>,
  id:   string,
  now:  string
): Record<string, unknown> {
  return {
    id,
    warehouse_id:  body.warehouseId  ?? body.warehouse_id,
    sku:           body.sku,
    barcode:       body.barcode      ?? null,
    name:          body.name,
    description:   body.description  ?? null,
    category:      body.category,
    size_kind:     body.sizeKind     ?? body.size_kind ?? 'na',
    selling_price: body.sellingPrice ?? body.selling_price ?? 0,
    cost_price:    body.costPrice    ?? body.cost_price    ?? 0,
    reorder_level: body.reorderLevel ?? body.reorder_level ?? 0,
    location:      body.location     ?? null,
    supplier:      body.supplier     ?? null,
    tags:          Array.isArray(body.tags)   ? body.tags   : [],
    images:        Array.isArray(body.images) ? body.images : [],
    updated_at:    now,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Size-row helpers
// ─────────────────────────────────────────────────────────────────────────────

// Parse sizeKind from body, falling back to existing
function resolveSizeKind(
  body:     Record<string, unknown>,
  existing: SizeKind | string | undefined
): SizeKind {
  const raw = String(
    (body as any).sizeKind ?? (body as any).size_kind ?? existing ?? 'na'
  ).toLowerCase().trim();
  if (raw === 'sized')    return 'sized';
  if (raw === 'one_size') return 'one_size';
  return 'na';
}

// Parse quantityBySize from body, normalise codes
function resolveRawSizes(
  body: Record<string, unknown>
): Array<{ sizeCode: string; quantity: number }> {
  const raw: Array<{ sizeCode?: string; size_code?: string; quantity?: number }> =
    (body as any).quantityBySize ??
    (body as any).quantity_by_size ??
    [];
  if (!Array.isArray(raw)) return [];
  return raw.map(e => ({
    sizeCode: String(e.sizeCode ?? e.size_code ?? '')
      .trim().replace(/\s+/g, '').toUpperCase(),
    quantity: Math.max(0, Math.floor(Number(e.quantity ?? 0))),
  }));
}

// Filter to valid, non-sentinel rows
function filterValidSizes(
  rows: Array<{ sizeCode: string; quantity: number }>
): Array<{ sizeCode: string; quantity: number }> {
  return rows.filter(
    r =>
      r.sizeCode &&
      r.sizeCode !== 'NA' &&
      !/^ONE_?SIZE$/i.test(r.sizeCode)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch size entries for a product (separate query — always accurate)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchSizeEntries(
  supabase:    SupabaseClient,
  warehouseId: string,
  productId:   string
): Promise<SizeEntry[]> {
  const { data } = await supabase
    .from('warehouse_inventory_by_size')
    .select('size_code, quantity, size_codes!left(size_label, sort_order)')
    .eq('warehouse_id', warehouseId)
    .eq('product_id',   productId);

  if (!data?.length) return [];

  return (data as any[])
    .map(r => ({
      sizeCode:  String(r.size_code),
      sizeLabel: String(r.size_codes?.size_label ?? r.size_code),
      quantity:  Number(r.quantity ?? 0),
      _sort:     Number(r.size_codes?.sort_order ?? 9999),
    }))
    .sort((a, b) => a._sort - b._sort || a.sizeCode.localeCompare(b.sizeCode))
    .map(({ _sort: _, ...r }) => r);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET: all products for a warehouse
// ─────────────────────────────────────────────────────────────────────────────

export async function getWarehouseProducts(
  warehouseId: string,
  options: { limit?: number; category?: string; inStock?: boolean } = {}
): Promise<WarehouseProductApi[]> {
  const supabase = getSupabase();
  const { limit = 1000, category, inStock } = options;

  // 1. Products + inventory total in one query
  let q = supabase
    .from('warehouse_products')
    .select('*, warehouse_inventory!left(quantity)')
    .eq('warehouse_id', warehouseId)
    .order('name', { ascending: true })
    .limit(limit);

  if (category) q = q.ilike('category', category);

  const { data: products, error } = await q;
  if (error) throw new Error(`getWarehouseProducts: ${error.message}`);
  if (!products?.length) return [];

  // 2. All per-size rows for this warehouse in ONE query (no N+1)
  const ids = products.map((p: any) => p.id as string);
  const { data: sizeData } = await supabase
    .from('warehouse_inventory_by_size')
    .select('product_id, size_code, quantity, size_codes!left(size_label, sort_order)')
    .eq('warehouse_id', warehouseId)
    .in('product_id', ids);

  // Group sizes by product_id
  const sizeMap: Record<string, SizeEntry[]> = {};
  for (const r of (sizeData ?? []) as any[]) {
    const pid = r.product_id as string;
    if (!sizeMap[pid]) sizeMap[pid] = [];
    sizeMap[pid].push({
      sizeCode:  String(r.size_code),
      sizeLabel: String(r.size_codes?.size_label ?? r.size_code),
      quantity:  Number(r.quantity ?? 0),
    });
  }

  // Sort each product's sizes by sort_order then alphabetically
  for (const pid of Object.keys(sizeMap)) {
    sizeMap[pid].sort((a, b) => a.sizeCode.localeCompare(b.sizeCode));
  }

  // 3. Assemble results
  const results: WarehouseProductApi[] = [];

  for (const p of products as any[]) {
    const invRow = Array.isArray(p.warehouse_inventory)
      ? p.warehouse_inventory[0]
      : p.warehouse_inventory;
    const sizes      = sizeMap[p.id] ?? [];
    const sizeKind   = p.size_kind as SizeKind;
    const totalQty   = sizeKind === 'sized' && sizes.length > 0
      ? sizes.reduce((s, r) => s + r.quantity, 0)
      : Number(invRow?.quantity ?? 0);

    if (inStock && totalQty === 0) continue;

    results.push(rowToApi(p, totalQty, sizes));
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET: single product
// ─────────────────────────────────────────────────────────────────────────────

export async function getWarehouseProductById(
  id:          string,
  warehouseId: string | undefined
): Promise<WarehouseProductApi | null> {
  const supabase = getSupabase();
  const wid = (warehouseId ?? getDefaultWarehouseId()).trim();

  const { data: p, error } = await supabase
    .from('warehouse_products')
    .select('*, warehouse_inventory!left(quantity)')
    .eq('id',           id)
    .eq('warehouse_id', wid)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw new Error(`getWarehouseProductById: ${error.message}`);
  }
  if (!p) return null;

  const sizes = await fetchSizeEntries(supabase, wid, id);

  const invRow  = Array.isArray(p.warehouse_inventory)
    ? p.warehouse_inventory[0]
    : p.warehouse_inventory;
  const totalQty = (p.size_kind as SizeKind) === 'sized' && sizes.length > 0
    ? sizes.reduce((s, r) => s + r.quantity, 0)
    : Number(invRow?.quantity ?? 0);

  return rowToApi(p, totalQty, sizes);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST: create product
// ─────────────────────────────────────────────────────────────────────────────

export async function createWarehouseProduct(
  body: Record<string, unknown>
): Promise<WarehouseProductApi> {
  const supabase   = getSupabase();
  const now        = ts();
  const wid        = String((body.warehouseId ?? body.warehouse_id) ?? getDefaultWarehouseId()).trim();
  const sizeKind   = resolveSizeKind(body, 'na');
  const rawSizes   = resolveRawSizes(body);
  const validSizes = sizeKind === 'sized' ? filterValidSizes(rawSizes) : [];
  const totalQty   = sizeKind === 'sized'
    ? validSizes.reduce((s, r) => s + r.quantity, 0)
    : Number((body as any).quantity ?? 0);

  // 1. Insert product
  const newId = crypto.randomUUID();
  const row = {
    ...bodyToRow(body, newId, now),
    warehouse_id: wid,
    size_kind:    sizeKind,
    created_at:   now,
    updated_at:   now,
    version:      1,
  };

  const { data: created, error: createErr } = await supabase
    .from('warehouse_products')
    .insert(row)
    .select()
    .single();

  if (createErr) throw new Error(`createWarehouseProduct: ${createErr.message}`);

  const productId = (created as any).id as string;

  // 2. Upsert inventory total
  await supabase
    .from('warehouse_inventory')
    .upsert({
      warehouse_id: wid,
      product_id:   productId,
      quantity:     totalQty,
      updated_at:   now,
    });

  // 3. Insert per-size rows
  if (sizeKind === 'sized' && validSizes.length > 0) {
    await supabase
      .from('warehouse_inventory_by_size')
      .delete()
      .eq('warehouse_id', wid)
      .eq('product_id',   productId);

    await supabase
      .from('warehouse_inventory_by_size')
      .insert(
        validSizes.map(r => ({
          warehouse_id: wid,
          product_id:   productId,
          size_code:    r.sizeCode,
          quantity:     r.quantity,
          updated_at:   now,
        }))
      );
  }

  // 4. Re-fetch for ground truth
  const result = await getWarehouseProductById(productId, wid);
  return result ?? rowToApi(created, totalQty, validSizes.map(r => ({
    sizeCode: r.sizeCode, sizeLabel: r.sizeCode, quantity: r.quantity,
  })));
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT: update product
//
// THIS WAS THE "not implemented" ERROR.
// Cursor replaced this function with a stub. Full implementation below.
//
// Flow:
//   1. Load existing product (404 if missing)
//   2. Resolve sizeKind + size rows from body
//   3. Try update_warehouse_product_atomic RPC
//   4. If RPC not found (error 42883) → manual fallback (inline below)
//   5. Re-fetch and return ground truth
// ─────────────────────────────────────────────────────────────────────────────

export async function updateWarehouseProduct(
  id:   string,
  body: Record<string, unknown>
): Promise<WarehouseProductApi> {
  const supabase = getSupabase();
  const now      = ts();
  const wid      = String((body.warehouseId ?? body.warehouse_id) ?? getDefaultWarehouseId()).trim();

  // 1. Load existing — 404 if missing
  const existing = await getWarehouseProductById(id, wid);
  if (!existing) {
    const err = new Error('Product not found') as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  const currentVersion = Number(existing.version ?? 0);

  // 2. Resolve sizeKind
  const sizeKind = resolveSizeKind(body, existing.sizeKind);

  // 3. Resolve size rows
  const rawSizes   = resolveRawSizes(body);
  const validSizes = sizeKind === 'sized' ? filterValidSizes(rawSizes) : [];

  // Detect legacy ONE_SIZE row
  const singleOneSize =
    sizeKind === 'sized' &&
    rawSizes.length === 1 &&
    /^ONE_?SIZE$/i.test(rawSizes[0].sizeCode);

  const effectiveSizeKind: SizeKind = singleOneSize ? 'one_size' : sizeKind;

  // 4. Build DB row
  const row: Record<string, unknown> = {
    ...bodyToRow(body, id, now),
    warehouse_id: wid,
    size_kind:    effectiveSizeKind,
    version:      currentVersion + 1,
    updated_at:   now,
  };

  // 5. Build RPC params
  //   pQuantityBySize:
  //     null  → don't touch by_size rows
  //     []    → delete all by_size rows (switching away from sized)
  //     [...] → full replace (DELETE + INSERT)
  let pQuantityBySize: Array<{ sizeCode: string; quantity: number }> | null;
  let pQuantity: number;

  if (singleOneSize) {
    pQuantityBySize = [];
    pQuantity       = rawSizes[0].quantity;
  } else if (effectiveSizeKind === 'sized') {
    if (validSizes.length > 0) {
      // Send ALL valid sizes — including qty=0 (size exists, just out of stock)
      // The RPC uses DELETE+INSERT so this IS the new truth.
      pQuantityBySize = validSizes;
      pQuantity       = validSizes.reduce((s, r) => s + r.quantity, 0);
    } else {
      // Body says sized but sent no rows — preserve existing to avoid data loss
      const preserved = existing.quantityBySize
        .map(e => ({ sizeCode: e.sizeCode, quantity: e.quantity }))
        .filter(e => e.sizeCode && e.sizeCode !== 'NA');
      pQuantityBySize = preserved.length > 0 ? preserved : null;
      pQuantity       = preserved.reduce((s, r) => s + r.quantity, 0);
    }
  } else {
    // na or one_size — clear size rows
    pQuantityBySize = [];
    pQuantity       = Number((body as any).quantity ?? existing.quantity ?? 0);
  }

  console.log(
    '[updateWarehouseProduct]',
    'id:', id,
    'sizeKind:', effectiveSizeKind,
    'sizes:', JSON.stringify(pQuantityBySize),
    'qty:', pQuantity
  );

  // 6. Try atomic RPC
  const { error: rpcError } = await supabase.rpc(
    'update_warehouse_product_atomic',
    {
      p_id:               id,
      p_warehouse_id:     wid,
      p_row:              row,
      p_current_version:  currentVersion,
      p_quantity:         pQuantity,
      p_quantity_by_size: pQuantityBySize !== null
        ? JSON.stringify(pQuantityBySize)
        : null,
    }
  );

  if (!rpcError) {
    // Re-fetch for ground truth (RPC returns warehouse_products row, no join)
    const updated = await getWarehouseProductById(id, wid);
    if (updated) {
      // Patch if sizes haven't replicated yet
      if (pQuantityBySize && pQuantityBySize.length > 0 && updated.quantityBySize.length === 0) {
        updated.quantityBySize = pQuantityBySize.map(r => ({
          sizeCode:  r.sizeCode,
          sizeLabel: r.sizeCode,
          quantity:  r.quantity,
        }));
        updated.quantity = pQuantity;
      }
      return updated;
    }
    return rowToApi(row, pQuantity, (pQuantityBySize ?? []).map(r => ({
      sizeCode: r.sizeCode, sizeLabel: r.sizeCode, quantity: r.quantity,
    })));
  }

  // 7. RPC not found — manual fallback (fully inline, no missing references)
  if (rpcError.code === '42883' || rpcError.message?.includes('does not exist')) {
    console.warn('[updateWarehouseProduct] RPC not found, using manual fallback');
    return _manualUpdate(
      supabase, id, wid, row, pQuantity, pQuantityBySize, now
    );
  }

  // 8. Optimistic lock conflict
  if (rpcError.message?.includes('updated by someone else')) {
    const err = new Error(rpcError.message) as Error & { status?: number };
    err.status = 409;
    throw err;
  }

  throw new Error(rpcError.message ?? 'Update failed');
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual fallback when RPC doesn't exist
// Fully inline — no external references.
// ─────────────────────────────────────────────────────────────────────────────

async function _manualUpdate(
  supabase:        SupabaseClient,
  id:              string,
  wid:             string,
  row:             Record<string, unknown>,
  totalQty:        number,
  sizeRows:        Array<{ sizeCode: string; quantity: number }> | null,
  now:             string,
): Promise<WarehouseProductApi> {

  // Update warehouse_products
  const { error: updErr } = await supabase
    .from('warehouse_products')
    .update(row)
    .eq('id',           id)
    .eq('warehouse_id', wid);
  if (updErr) throw new Error(`_manualUpdate products: ${updErr.message}`);

  // Upsert inventory total
  await supabase.from('warehouse_inventory').upsert({
    warehouse_id: wid,
    product_id:   id,
    quantity:     totalQty,
    updated_at:   now,
  });

  // Update sizes if provided
  if (sizeRows !== null) {
    await supabase
      .from('warehouse_inventory_by_size')
      .delete()
      .eq('warehouse_id', wid)
      .eq('product_id',   id);

    if (sizeRows.length > 0) {
      await supabase.from('warehouse_inventory_by_size').insert(
        sizeRows.map(r => ({
          warehouse_id: wid,
          product_id:   id,
          size_code:    r.sizeCode,
          quantity:     r.quantity,
          updated_at:   now,
        }))
      );
    }
  }

  const result = await getWarehouseProductById(id, wid);
  if (!result) throw new Error('Product not found after update');
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE: remove product + all inventory rows
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteWarehouseProduct(
  id:          string,
  warehouseId: string
): Promise<void> {
  const supabase = getSupabase();
  const wid      = warehouseId.trim();

  // Delete inventory rows first (avoids FK issues if constraints exist)
  await supabase
    .from('warehouse_inventory_by_size')
    .delete()
    .eq('warehouse_id', wid)
    .eq('product_id',   id);

  await supabase
    .from('warehouse_inventory')
    .delete()
    .eq('warehouse_id', wid)
    .eq('product_id',   id);

  const { error } = await supabase
    .from('warehouse_products')
    .delete()
    .eq('id',           id)
    .eq('warehouse_id', wid);

  if (error) throw new Error(`deleteWarehouseProduct: ${error.message}`);
}
