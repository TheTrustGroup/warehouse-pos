// ============================================================
// getWarehouseProducts_fix.ts
// Replaces: inventory-server/lib/data/warehouseProducts.ts
//           → the getWarehouseProducts() and getWarehouseProductById() functions
//
// THE FIX:
// Instead of querying warehouse_products and warehouse_inventory separately
// and manually trying to join quantityBySize, use the v_products_inventory
// view which does the join correctly in SQL (see COMPLETE_SQL_FIX.sql).
//
// This ensures quantityBySize is ALWAYS populated for sized products —
// both in the inventory grid AND when opening the edit modal.
//
// BEFORE: products sometimes returned with quantityBySize: []
//         because the JOIN was missing or conditional
// AFTER:  view always aggregates from warehouse_inventory_by_size
//         so every sized product has its sizes, always
// ============================================================

import { getSupabase } from '../supabase';

// ── Types (matching what frontend expects) ────────────────────────────────

export interface SizeRow {
  sizeCode: string;
  sizeLabel: string;
  quantity: number;
}

export interface ProductRecord {
  id: string;
  warehouseId: string;
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  category: string;
  sizeKind: 'na' | 'one_size' | 'sized';
  sellingPrice: number;
  costPrice: number;
  reorderLevel: number;
  quantity: number;
  quantityBySize: SizeRow[];
  location?: Record<string, string>;
  supplier?: Record<string, string>;
  tags?: string[];
  images?: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ── getWarehouseProducts (replaces existing function) ─────────────────────
//
// CHANGE from existing code:
//   OLD: supabase.from('warehouse_products').select(...)  ← no size join
//   NEW: supabase.from('v_products_inventory').select(*)  ← view does it
//
// The view handles the LEFT JOIN to warehouse_inventory_by_size and
// size_codes, returning quantityBySize as a JSONB array. We just parse it.

export interface ListProductsOptions {
  limit?: number;
  offset?: number;
  inStock?: boolean;
  category?: string;
  q?: string;
  lowStock?: boolean;
  outOfStock?: boolean;
}

export async function getWarehouseProducts(
  warehouseId: string | undefined,
  options: ListProductsOptions = {}
): Promise<{ data: ProductRecord[]; total: number }> {
  if (!warehouseId?.trim()) {
    return { data: [], total: 0 };
  }
  const { limit = 1000, offset = 0, inStock = false, category, q, lowStock, outOfStock } = options;
  const effectiveLimit = Math.min(Math.max(1, limit), 2000);
  const supabase = getSupabase();

  let query = supabase
    .from('v_products_inventory')
    .select('*')
    .eq('warehouse_id', warehouseId.trim())
    .order('name', { ascending: true })
    .range(offset, offset + effectiveLimit - 1);

  if (inStock) query = query.gt('quantity', 0);
  if (category) query = query.ilike('category', category);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load products: ${error.message}`);
  }

  let list = (data ?? []).map(normalizeRow);

  if (q && q.trim()) {
    const lower = q.trim().toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        (p.sku && p.sku.toLowerCase().includes(lower)) ||
        (p.barcode && p.barcode.toLowerCase().includes(lower))
    );
  }
  if (lowStock) {
    list = list.filter((p) => p.quantity > 0 && p.quantity <= p.reorderLevel);
  }
  if (outOfStock) {
    list = list.filter((p) => p.quantity === 0);
  }

  return { data: list, total: list.length };
}

// ── getWarehouseProductById (replaces existing function) ──────────────────

export async function getWarehouseProductById(
  productId: string,
  warehouseId?: string
): Promise<ProductRecord | null> {
  if (!warehouseId?.trim()) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('v_products_inventory')
    .select('*')
    .eq('id', productId)
    .eq('warehouse_id', warehouseId.trim())
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw new Error(`Failed to load product: ${error.message}`);
  }

  return data ? normalizeRow(data) : null;
}

// ── createWarehouseProduct: insert product + inventory + per-size rows ───────

function toSizeKind(v: unknown): 'na' | 'one_size' | 'sized' {
  const s = String(v ?? 'na').toLowerCase();
  if (s === 'one_size' || s === 'onesize') return 'one_size';
  if (s === 'sized') return 'sized';
  return 'na';
}

export async function createWarehouseProduct(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const supabase = getSupabase();
  const id = (body.id && String(body.id).trim()) || crypto.randomUUID();
  const warehouseId = String(body.warehouseId ?? body.warehouse_id ?? '').trim();
  if (!warehouseId) throw new Error('warehouseId is required');

  const name = String(body.name ?? '').trim();
  if (!name) throw new Error('name is required');
  const sku = String(body.sku ?? '').trim() || id;
  const sizeKind = toSizeKind(body.sizeKind ?? body.size_kind);
  const quantityBySize = Array.isArray(body.quantityBySize) ? body.quantityBySize as Array<{ sizeCode?: string; quantity?: number }> : [];
  const totalQty = sizeKind === 'sized' && quantityBySize.length > 0
    ? quantityBySize.reduce((s, r) => s + Math.max(0, Number(r.quantity ?? 0)), 0)
    : Math.max(0, Number(body.quantity ?? 0));

  const now = new Date().toISOString();
  const productRow: Record<string, unknown> = {
    id,
    sku,
    barcode: String(body.barcode ?? '').trim() || '',
    name,
    description: body.description != null ? String(body.description) : '',
    category: String(body.category ?? '').trim() || 'Uncategorized',
    size_kind: sizeKind,
    selling_price: Number(body.sellingPrice ?? body.selling_price ?? 0),
    cost_price: Number(body.costPrice ?? body.cost_price ?? 0),
    reorder_level: Math.max(0, Number(body.reorderLevel ?? body.reorder_level ?? 0)),
    location: body.location && typeof body.location === 'object' ? body.location : {},
    supplier: body.supplier && typeof body.supplier === 'object' ? body.supplier : {},
    tags: Array.isArray(body.tags) ? body.tags : [],
    images: Array.isArray(body.images) ? body.images : [],
    version: 1,
    created_at: now,
    updated_at: now,
  };

  const { error: errProduct } = await supabase.from('warehouse_products').insert(productRow);
  if (errProduct) throw new Error(`Failed to create product: ${errProduct.message}`);

  const { error: errInv } = await supabase.from('warehouse_inventory').insert({
    warehouse_id: warehouseId,
    product_id: id,
    quantity: totalQty,
    updated_at: now,
  });
  if (errInv) {
    if (errInv.code === '23505') {
      const { error: errUpd } = await supabase
        .from('warehouse_inventory')
        .update({ quantity: totalQty, updated_at: now })
        .eq('warehouse_id', warehouseId)
        .eq('product_id', id);
      if (errUpd) throw new Error(`Failed to set inventory: ${errUpd.message}`);
    } else {
      throw new Error(`Failed to set inventory: ${errInv.message}`);
    }
  }

  if (sizeKind === 'sized' && quantityBySize.length > 0) {
    for (const row of quantityBySize) {
      const code = String(row.sizeCode ?? '').trim();
      if (!code) continue;
      const qty = Math.max(0, Number(row.quantity ?? 0));
      const sizeCodeNorm = code.replace(/\s+/g, ' ');
      const { data: existing } = await supabase.from('size_codes').select('size_code').eq('size_code', sizeCodeNorm).maybeSingle();
      if (!existing) {
        await supabase.from('size_codes').insert({ size_code: sizeCodeNorm, size_label: code.trim(), sort_order: 999 });
      }
      const { error: errSize } = await supabase.from('warehouse_inventory_by_size').insert({
        warehouse_id: warehouseId,
        product_id: id,
        size_code: sizeCodeNorm,
        quantity: qty,
        updated_at: now,
      });
      if (errSize) {
        if (errSize.code === '23505') {
          await supabase
            .from('warehouse_inventory_by_size')
            .update({ quantity: qty, updated_at: now })
            .eq('warehouse_id', warehouseId)
            .eq('product_id', id)
            .eq('size_code', sizeCodeNorm);
        } else {
          throw new Error(`Failed to set size ${code}: ${errSize.message}`);
        }
      }
    }
  }

  const created = await getWarehouseProductById(String(id), String(warehouseId));
  if (!created) return { id, ...productRow, quantity: totalQty, warehouseId };
  return {
    id: created.id,
    warehouseId: created.warehouseId,
    sku: created.sku,
    barcode: created.barcode,
    name: created.name,
    description: created.description,
    category: created.category,
    sizeKind: created.sizeKind,
    sellingPrice: created.sellingPrice,
    costPrice: created.costPrice,
    reorderLevel: created.reorderLevel,
    quantity: created.quantity,
    quantityBySize: created.quantityBySize,
    location: created.location,
    supplier: created.supplier,
    tags: created.tags,
    images: created.images,
    version: created.version,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
}

// ── updateWarehouseProduct: size-aware atomic update ───────────────────────
// Uses update_warehouse_product_atomic RPC only (no fallback).

function normSizeKind(b: Record<string, unknown>, fallback: string): string {
  const s = String(b.sizeKind ?? b.size_kind ?? fallback ?? 'na').toLowerCase().trim();
  return s === 'sized' ? 'sized' : s === 'one_size' ? 'one_size' : 'na';
}

function parseRawSizes(b: Record<string, unknown>): Array<{ sizeCode: string; quantity: number }> {
  const arr = (b.quantityBySize ?? b.quantity_by_size) as unknown[] | undefined;
  if (!Array.isArray(arr)) return [];
  return arr.map((r: unknown) => {
    const item = r as { sizeCode?: string; size_code?: string; quantity?: number };
    return {
      sizeCode: String(item.sizeCode ?? item.size_code ?? '').trim().toUpperCase().replace(/\s+/g, ''),
      quantity: Math.max(0, Math.floor(Number(item.quantity ?? 0))),
    };
  });
}

function filterSizes(rows: Array<{ sizeCode: string; quantity: number }>): Array<{ sizeCode: string; quantity: number }> {
  return rows.filter(
    (r) => r.sizeCode && r.sizeCode !== 'NA' && !/^ONE_?SIZE$/i.test(r.sizeCode)
  );
}

/** Build row for warehouse_products only (global products: no warehouse_id on table). */
function buildProductRow(
  b: Record<string, unknown>,
  id: string,
  _wid: string,
  sizeKind: string,
  now: string,
  version: number
): Record<string, unknown> {
  return {
    id,
    sku: b.sku ?? '',
    barcode: b.barcode ?? null,
    name: b.name ?? '',
    description: b.description ?? null,
    category: b.category ?? '',
    size_kind: sizeKind,
    selling_price: Number(b.sellingPrice ?? b.selling_price ?? 0),
    cost_price: Number(b.costPrice ?? b.cost_price ?? 0),
    reorder_level: Number(b.reorderLevel ?? b.reorder_level ?? 0),
    location: b.location ?? null,
    supplier: b.supplier ?? null,
    tags: Array.isArray(b.tags) ? b.tags : [],
    images: Array.isArray(b.images) ? b.images : [],
    version,
    updated_at: now,
  };
}

export class ProductUpdateError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ProductUpdateError';
  }
}

export async function updateWarehouseProduct(
  id: string,
  body: Record<string, unknown>
): Promise<ProductRecord> {
  const supabase = getSupabase();
  const wid = String(body.warehouseId ?? body.warehouse_id ?? '').trim();
  if (!wid) throw new ProductUpdateError('warehouseId required', 400);

  const now = new Date().toISOString();

  const { data: existing, error: fetchErr } = await supabase
    .from('warehouse_products')
    .select('id, version, size_kind')
    .eq('id', id)
    .single();

  if (fetchErr || !existing) {
    throw new ProductUpdateError('Product not found', 404);
  }

  const existingRow = existing as { version?: number; size_kind?: string };
  const currentVersion = Number(existingRow.version ?? 0);
  const sizeKind = normSizeKind(body, existingRow.size_kind ?? '');
  const rawSizes = parseRawSizes(body);

  const singleOneSize =
    sizeKind === 'sized' &&
    rawSizes.length === 1 &&
    /^ONE_?SIZE$/i.test(rawSizes[0]?.sizeCode ?? '');
  const effectiveSK = singleOneSize ? 'one_size' : sizeKind;
  const validSizes = effectiveSK === 'sized' ? filterSizes(rawSizes) : [];

  let sizesToWrite: Array<{ sizeCode: string; quantity: number }> | null;
  let totalQty: number;

  if (singleOneSize) {
    sizesToWrite = [];
    totalQty = rawSizes[0].quantity;
  } else if (effectiveSK === 'sized') {
    if (validSizes.length > 0) {
      sizesToWrite = validSizes;
      totalQty = validSizes.reduce((s, r) => s + r.quantity, 0);
    } else {
      sizesToWrite = null;
      const { data: cur } = await supabase
        .from('warehouse_inventory_by_size')
        .select('quantity')
        .eq('warehouse_id', wid)
        .eq('product_id', id);
      totalQty = (cur ?? []).reduce(
        (s: number, r: { quantity?: number }) => s + Number(r.quantity ?? 0),
        0
      );
    }
  } else {
    sizesToWrite = [];
    totalQty = Number(body.quantity ?? (existing as { quantity?: number }).quantity ?? 0);
  }

  const productRow = buildProductRow(body, id, wid, effectiveSK, now, currentVersion + 1);

  const { error: rpcErr } = await supabase.rpc('update_warehouse_product_atomic', {
    p_id: id,
    p_warehouse_id: wid,
    p_row: productRow,
    p_current_version: currentVersion,
    p_quantity: totalQty,
    p_quantity_by_size: sizesToWrite !== null ? sizesToWrite : null,
  });

  if (rpcErr) {
    if (rpcErr.message?.includes('someone else') || rpcErr.message?.includes('version conflict')) {
      throw new ProductUpdateError(rpcErr.message, 409);
    }
    throw new ProductUpdateError(rpcErr.message ?? 'Update failed', 500);
  }

  const updated = await getWarehouseProductById(id, wid);
  if (!updated) throw new ProductUpdateError('Not found after update', 404);

  if (
    sizesToWrite &&
    sizesToWrite.length > 0 &&
    updated.quantityBySize.length === 0
  ) {
    updated.quantityBySize = sizesToWrite.map((r) => ({
      sizeCode: r.sizeCode,
      sizeLabel: r.sizeCode,
      quantity: r.quantity,
    }));
    updated.quantity = totalQty;
  }

  return updated;
}

/** Remove product from this warehouse; delete product row only if no warehouse references it. */
export async function deleteWarehouseProduct(id: string, warehouseId: string): Promise<void> {
  const wid = warehouseId.trim();
  if (!wid) throw new Error('warehouseId required');

  const supabase = getSupabase();
  await supabase.from('warehouse_inventory_by_size').delete().eq('warehouse_id', wid).eq('product_id', id);
  await supabase.from('warehouse_inventory').delete().eq('warehouse_id', wid).eq('product_id', id);
  const { data: remaining } = await supabase
    .from('warehouse_inventory')
    .select('warehouse_id')
    .eq('product_id', id)
    .limit(1);
  if (!remaining || remaining.length === 0) {
    const { error } = await supabase.from('warehouse_products').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
}

export async function deleteWarehouseProductsBulk(_ids: string[]): Promise<void> {
  throw new Error('deleteWarehouseProductsBulk not implemented');
}

// ── normalizeRow ──────────────────────────────────────────────────────────
// Converts view row to ProductRecord shape.
// The view returns quantityBySize as a JSONB array — Supabase JS client
// parses it automatically as a JS array.

function normalizeRow(row: Record<string, unknown>): ProductRecord {
  // quantityBySize comes back as parsed JSON array from the view
  let quantityBySize: SizeRow[] = [];

  const qbs = row['quantityBySize'] ?? row['quantity_by_size'];
  if (Array.isArray(qbs)) {
    quantityBySize = qbs.map((r: Record<string, unknown>) => ({
      sizeCode: String(r.sizeCode ?? r.size_code ?? ''),
      sizeLabel: String(
        r.sizeLabel ?? r.size_label ?? r.sizeCode ?? r.size_code ?? ''
      ),
      quantity: Number(r.quantity ?? 0),
    }));
  }

  return {
    id: String(row.id ?? ''),
    warehouseId: String(row.warehouse_id ?? row.warehouseId ?? ''),
    sku: String(row.sku ?? ''),
    barcode: row.barcode ? String(row.barcode) : undefined,
    name: String(row.name ?? ''),
    description: row.description ? String(row.description) : undefined,
    category: String(row.category ?? ''),
    sizeKind: (row['sizeKind'] ?? row.size_kind ?? 'na') as
      | 'na'
      | 'one_size'
      | 'sized',
    sellingPrice: Number(row['sellingPrice'] ?? row.selling_price ?? 0),
    costPrice: Number(row['costPrice'] ?? row.cost_price ?? 0),
    reorderLevel: Number(row['reorderLevel'] ?? row.reorder_level ?? 0),
    quantity: Number(row.quantity ?? 0),
    quantityBySize,
    location: row.location as Record<string, string> | undefined,
    supplier: row.supplier as Record<string, string> | undefined,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    images: Array.isArray(row.images) ? (row.images as string[]) : [],
    version: Number(row.version ?? 0),
    createdAt: String(row['createdAt'] ?? row.created_at ?? ''),
    updatedAt: String(row['updatedAt'] ?? row.updated_at ?? ''),
  };
}
