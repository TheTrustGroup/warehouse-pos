/**
 * Warehouse products API — single source of truth in this repo.
 * Table: warehouse_products (no quantity column after migration); quantity lives in warehouse_inventory.
 * Used by GET/POST/PUT/DELETE /api/products and /admin/api/products.
 * All quantity read/write is scoped by warehouse_id.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getDefaultWarehouseId } from './warehouses';
import { getQuantitiesForProducts, getQuantity, ensureQuantity, setQuantity } from './warehouseInventory';
import { getQuantitiesBySize, getQuantitiesBySizeForProducts, setQuantitiesBySize, type QuantityBySizeEntry } from './warehouseInventoryBySize';
import { getSizeCodes } from './sizeCodes';

export interface ListProductsOptions {
  limit?: number;
  offset?: number;
  q?: string;
  category?: string;
  lowStock?: boolean;
  outOfStock?: boolean;
  /** When true, return minimal fields for POS (id, name, sku, barcode, sellingPrice, quantity). */
  pos?: boolean;
}

const TABLE = 'warehouse_products';

const getSupabase = (): SupabaseClient => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
};

const now = () => new Date().toISOString();

/** Shape stored in DB (snake_case). Quantity is in warehouse_inventory, not here. */
export interface WarehouseProductRow {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  cost_price: number;
  selling_price: number;
  reorder_level: number;
  location: { warehouse: string; aisle: string; rack: string; bin: string };
  supplier: { name: string; contact: string; email: string };
  images: string[];
  expiry_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  version?: number;
  /** Additive: na | one_size | sized. Default na. */
  size_kind?: string;
}

function rowToApi(
  row: WarehouseProductRow,
  quantity: number = 0,
  quantityBySize?: Array<{ sizeCode: string; sizeLabel?: string; quantity: number }>
): Record<string, unknown> {
  const sizeKind = (row.size_kind ?? 'na') as string;
  const out: Record<string, unknown> = {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode ?? '',
    name: row.name,
    description: row.description ?? '',
    category: row.category ?? '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    quantity,
    costPrice: row.cost_price,
    sellingPrice: row.selling_price,
    reorderLevel: row.reorder_level ?? 0,
    location: row.location && typeof row.location === 'object' ? row.location : { warehouse: '', aisle: '', rack: '', bin: '' },
    supplier: row.supplier && typeof row.supplier === 'object' ? row.supplier : { name: '', contact: '', email: '' },
    images: Array.isArray(row.images) ? row.images : [],
    expiryDate: row.expiry_date,
    createdBy: row.created_by ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version ?? 0,
    sizeKind,
  };
  if (quantityBySize && quantityBySize.length > 0) {
    out.quantityBySize = quantityBySize;
  }
  return out;
}

/** Build product row for insert/update (no quantity; quantity is in warehouse_inventory). */
function bodyToRow(body: Record<string, unknown>, id: string, ts: string): Record<string, unknown> {
  const loc = body.location && typeof body.location === 'object' && !Array.isArray(body.location) ? body.location as Record<string, string> : {};
  const sup = body.supplier && typeof body.supplier === 'object' && !Array.isArray(body.supplier) ? body.supplier as Record<string, string> : {};
  const sizeKind = String(body.sizeKind ?? body.size_kind ?? 'na').toLowerCase();
  const validSizeKind = ['na', 'one_size', 'sized'].includes(sizeKind) ? sizeKind : 'na';
  return {
    id,
    sku: String(body.sku ?? '').trim() || id,
    barcode: String(body.barcode ?? ''),
    name: String(body.name ?? '').trim(),
    description: body.description != null ? String(body.description) : '',
    category: String(body.category ?? ''),
    tags: Array.isArray(body.tags) ? body.tags : [],
    cost_price: Number(body.costPrice ?? body.cost_price) || 0,
    selling_price: Number(body.sellingPrice ?? body.selling_price) || 0,
    reorder_level: Number(body.reorderLevel ?? body.reorder_level) || 0,
    location: { warehouse: loc.warehouse ?? '', aisle: loc.aisle ?? '', rack: loc.rack ?? '', bin: loc.bin ?? '' },
    supplier: { name: sup.name ?? '', contact: sup.contact ?? '', email: sup.email ?? '' },
    images: Array.isArray(body.images) ? body.images : [],
    expiry_date: body.expiryDate ?? body.expiry_date ?? null,
    created_by: String(body.createdBy ?? body.created_by ?? ''),
    created_at: body.createdAt ?? body.created_at ?? ts,
    updated_at: ts,
    version: Number(body.version ?? body.version ?? 0) || 0,
    size_kind: validSizeKind,
  };
}

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

/** GET warehouse products with optional pagination, search, and filters. Quantity is for the given warehouse. */
export async function getWarehouseProducts(
  warehouseId?: string,
  options: ListProductsOptions = {}
): Promise<{ data: Record<string, unknown>[]; total?: number }> {
  const supabase = getSupabase();
  const wid = (warehouseId?.trim?.() && warehouseId) ? warehouseId : getDefaultWarehouseId();
  const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.max(0, options.offset ?? 0);
  const q = (options.q ?? '').trim();
  const category = (options.category ?? '').trim();
  const lowStock = options.lowStock === true;
  const outOfStock = options.outOfStock === true;
  const pos = options.pos === true;

  const selectOpts = pos
    ? { count: 'exact' as const }
    : { count: 'exact' as const };
  let query = supabase
    .from(TABLE)
    .select(pos ? 'id, name, sku, barcode, selling_price, reorder_level, updated_at' : '*', selectOpts)
    .order('updated_at', { ascending: false });

  if (q) {
    const safe = q.replace(/'/g, "''").replace(/%/g, '\\%').replace(/\\/g, '\\\\');
    const pattern = `%${safe}%`;
    const quoted = `"${pattern.replace(/"/g, '""')}"`;
    query = query.or(`name.ilike.${quoted},sku.ilike.${quoted},barcode.ilike.${quoted}`);
  }
  if (category) {
    query = query.eq('category', category);
  }

  const { data: rows, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw error;

  const productRows = (rows ?? []) as unknown as WarehouseProductRow[];
  if (productRows.length === 0) {
    return { data: [], total: count ?? 0 };
  }
  const ids = productRows.map((r) => r.id);
  const quantities = await getQuantitiesForProducts(wid, ids);

  const sizedIds = productRows.filter((r) => (r.size_kind ?? 'na') === 'sized').map((r) => r.id);
  const bySizeMap = sizedIds.length > 0 ? await getQuantitiesBySizeForProducts(wid, sizedIds) : new Map<string, QuantityBySizeEntry[]>();

  let merged: Record<string, unknown>[];
  if (pos) {
    merged = productRows.map((row) => {
      const qty = quantities.get(row.id) ?? 0;
      const bySize = bySizeMap.get(row.id);
      const quantityBySize = bySize && bySize.length > 0 ? bySize.map((e) => ({ sizeCode: e.sizeCode, quantity: e.quantity })) : undefined;
      return posRowToApi(row, qty, quantityBySize);
    });
  } else {
    const sizeLabels = await getSizeCodes().then((list) => new Map(list.map((s) => [s.size_code, s.size_label])));
    merged = productRows.map((row) => {
      const qty = quantities.get(row.id) ?? 0;
      const bySize = bySizeMap.get(row.id);
      const quantityBySize =
        bySize && bySize.length > 0
          ? bySize.map((e) => ({
              sizeCode: e.sizeCode,
              sizeLabel: sizeLabels.get(e.sizeCode) ?? e.sizeCode,
              quantity: e.quantity,
            }))
          : undefined;
      return rowToApi(row, qty, quantityBySize);
    });
  }

  if (lowStock || outOfStock) {
    merged = merged.filter((p) => {
      const qty = Number((p as { quantity?: number }).quantity ?? 0);
      const reorder = Number((p as { reorderLevel?: number }).reorderLevel ?? 0);
      if (outOfStock && qty === 0) return true;
      if (lowStock && qty > 0 && qty <= reorder) return true;
      return false;
    });
  }

  const total = count ?? (q || category ? undefined : merged.length);
  return { data: merged, total: total ?? undefined };
}

function posRowToApi(
  row: WarehouseProductRow,
  quantity: number,
  quantityBySize?: Array<{ sizeCode: string; quantity: number }>
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode ?? '',
    sellingPrice: row.selling_price,
    reorderLevel: row.reorder_level ?? 0,
    quantity,
    updatedAt: row.updated_at,
  };
  if (quantityBySize && quantityBySize.length > 0) {
    out.quantityBySize = quantityBySize;
  }
  return out;
}

/** GET one by id. Quantity is for the given warehouseId (default if omitted). */
export async function getWarehouseProductById(id: string, warehouseId?: string): Promise<Record<string, unknown> | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as WarehouseProductRow;
  const wid = (warehouseId?.trim?.() && warehouseId) ? warehouseId : getDefaultWarehouseId();
  const qty = await getQuantity(wid, id);
  if ((row.size_kind ?? 'na') === 'sized') {
    const bySize = await getQuantitiesBySize(wid, id);
    const sizeLabels = await getSizeCodes().then((list) => new Map(list.map((s) => [s.size_code, s.size_label])));
    const quantityBySize = bySize.map((e) => ({
      sizeCode: e.sizeCode,
      sizeLabel: sizeLabels.get(e.sizeCode) ?? e.sizeCode,
      quantity: e.quantity,
    }));
    return rowToApi(row, qty, quantityBySize);
  }
  return rowToApi(row, qty);
}

/** POST: create one. Uses atomic RPC when available (product + inventory + by_size in one transaction); fallback to legacy path. */
export async function createWarehouseProduct(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const supabase = getSupabase();
  const id: string = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : crypto.randomUUID();
  const ts = now();
  const wid = (body.warehouseId as string) ?? getDefaultWarehouseId();
  const quantityBySizeRaw = body.quantityBySize as Array<{ sizeCode: string; quantity: number }> | undefined;
  const hasSized = Array.isArray(quantityBySizeRaw) && quantityBySizeRaw.length > 0;
  const row = bodyToRow(body, id, ts) as Record<string, unknown> & { size_kind: string };
  if (hasSized) row.size_kind = 'sized';
  const quantity = hasSized
    ? (quantityBySizeRaw as QuantityBySizeEntry[]).reduce((s, e) => s + Math.max(0, Math.floor(Number(e.quantity) ?? 0)), 0)
    : Number(body.quantity) ?? 0;
  const pQuantityBySize =
    hasSized && quantityBySizeRaw
      ? quantityBySizeRaw
          .map((e) => ({
            sizeCode: String(e.sizeCode ?? '').trim().replace(/\s+/g, '').toUpperCase() || 'NA',
            quantity: Math.max(0, Math.floor(Number(e.quantity) ?? 0)),
          }))
          .filter((e) => e.sizeCode)
      : [];

  const { data: rpcData, error: rpcError } = await supabase.rpc('create_warehouse_product_atomic', {
    p_id: id,
    p_warehouse_id: wid,
    p_row: row,
    p_quantity: quantity,
    p_quantity_by_size: pQuantityBySize,
  });

  if (!rpcError) {
    const outRow = rpcData as WarehouseProductRow;
    const created = await getWarehouseProductById(outRow.id, wid);
    return created ?? rowToApi(outRow, quantity, hasSized ? pQuantityBySize.map((e) => ({ ...e, sizeLabel: e.sizeCode })) : undefined);
  }

  if (rpcError.code === '42883' || rpcError.message?.includes('does not exist')) {
    return createWarehouseProductLegacy(body, id, ts, row, wid, quantityBySizeRaw, hasSized);
  }
  throw rpcError;
}

/** Legacy create path (multiple round-trips, best-effort rollback). Used when atomic RPC is not yet deployed. */
async function createWarehouseProductLegacy(
  body: Record<string, unknown>,
  id: string,
  ts: string,
  row: Record<string, unknown> & { size_kind: string },
  wid: string,
  quantityBySizeRaw: Array<{ sizeCode: string; quantity: number }> | undefined,
  hasSized: boolean
): Promise<Record<string, unknown>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from(TABLE).insert(row).select().single();
  if (error) throw error;
  try {
    if (hasSized && quantityBySizeRaw?.length) {
      const entries: QuantityBySizeEntry[] = quantityBySizeRaw.map((e) => ({
        sizeCode: String(e.sizeCode ?? '').trim().replace(/\s+/g, '').toUpperCase() || 'NA',
        quantity: Math.max(0, Math.floor(Number(e.quantity) ?? 0)),
      })).filter((e) => e.sizeCode);
      await setQuantitiesBySize(wid, id, entries);
      const quantity = entries.reduce((sum, e) => sum + e.quantity, 0);
      await ensureQuantity(wid, id, quantity);
    } else {
      await ensureQuantity(wid, id, Number(body.quantity) ?? 0);
    }
  } catch (e) {
    await supabase.from(TABLE).delete().eq('id', id);
    throw e;
  }
  const outRow = data as WarehouseProductRow;
  const qty = hasSized
    ? (quantityBySizeRaw as QuantityBySizeEntry[]).reduce((s, e) => s + e.quantity, 0)
    : Number(body.quantity) ?? 0;
  if (hasSized && quantityBySizeRaw) {
    const sizeLabels = await getSizeCodes().then((list) => new Map(list.map((s) => [s.size_code, s.size_label])));
    const quantityBySize = quantityBySizeRaw.map((e) => ({
      sizeCode: String(e.sizeCode ?? '').trim().replace(/\s+/g, '').toUpperCase() || 'NA',
      sizeLabel: sizeLabels.get(String(e.sizeCode ?? '').trim().replace(/\s+/g, '').toUpperCase()) ?? e.sizeCode,
      quantity: Math.max(0, Math.floor(Number(e.quantity) ?? 0)),
    }));
    return rowToApi(outRow, qty, quantityBySize);
  }
  return rowToApi(outRow, qty);
}

/** PUT: update one. Uses atomic RPC when available; fallback to legacy. Optimistic lock: version; 409 if conflict. */
export async function updateWarehouseProduct(id: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const existing = await getWarehouseProductById(id);
  if (!existing) {
    const err = new Error('Product not found') as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  const currentVersion = Number(existing.version ?? 0);
  const ts = now();
  const wid = (body.warehouseId as string) ?? getDefaultWarehouseId();
  const quantityBySizeRaw = (body as { quantityBySize?: Array<{ sizeCode: string; quantity: number }> }).quantityBySize;
  const hasSized = Array.isArray(quantityBySizeRaw) && quantityBySizeRaw.length > 0;
  const row = bodyToRow({ ...existing, ...body, id, updatedAt: ts, version: currentVersion + 1 }, id, ts);

  const supabase = getSupabase();
  const pQuantity = typeof (body as { quantity?: number }).quantity === 'number' ? (body as { quantity: number }).quantity : null;
  const pQuantityBySize =
    hasSized && quantityBySizeRaw
      ? quantityBySizeRaw.map((e) => ({
          sizeCode: String(e.sizeCode ?? '').trim().replace(/\s+/g, '').toUpperCase() || 'NA',
          quantity: Math.max(0, Math.floor(Number(e.quantity) ?? 0)),
        })).filter((e) => e.sizeCode)
      : null;

  const { data: rpcData, error: rpcError } = await supabase.rpc('update_warehouse_product_atomic', {
    p_id: id,
    p_warehouse_id: wid,
    p_row: row,
    p_current_version: currentVersion,
    p_quantity: pQuantity,
    p_quantity_by_size: pQuantityBySize,
  });

  if (!rpcError) {
    const updated = await getWarehouseProductById(id, wid);
    return updated ?? rowToApi(rpcData as WarehouseProductRow, 0);
  }

  if (rpcError.code === '42883' || rpcError.message?.includes('does not exist')) {
    return updateWarehouseProductLegacy(id, body, existing, currentVersion, ts, wid, quantityBySizeRaw, hasSized);
  }
  if (rpcError.message?.includes('updated by someone else')) {
    const err = new Error(rpcError.message) as Error & { status?: number };
    err.status = 409;
    throw err;
  }
  throw rpcError;
}

/** Legacy update path (product update then inventory; not atomic). */
async function updateWarehouseProductLegacy(
  id: string,
  body: Record<string, unknown>,
  existing: Record<string, unknown>,
  currentVersion: number,
  ts: string,
  wid: string,
  quantityBySizeRaw: Array<{ sizeCode: string; quantity: number }> | undefined,
  hasSized: boolean
): Promise<Record<string, unknown>> {
  const supabase = getSupabase();
  const nextVersion = currentVersion + 1;
  const row = bodyToRow({ ...existing, ...body, id, updatedAt: ts, version: nextVersion }, id, ts);
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...row, version: nextVersion })
    .eq('id', id)
    .eq('version', currentVersion)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error('Product was updated by someone else. Please refresh and try again.') as Error & { status?: number };
    err.status = 409;
    throw err;
  }
  if (hasSized && quantityBySizeRaw?.length) {
    const entries: QuantityBySizeEntry[] = quantityBySizeRaw.map((e) => ({
      sizeCode: String(e.sizeCode ?? '').trim().replace(/\s+/g, '').toUpperCase() || 'NA',
      quantity: Math.max(0, Math.floor(Number(e.quantity) ?? 0)),
    })).filter((e) => e.sizeCode);
    await setQuantitiesBySize(wid, id, entries);
    await setQuantity(wid, id, entries.reduce((s, e) => s + e.quantity, 0));
  } else if (typeof (body as { quantity?: number }).quantity === 'number') {
    await setQuantity(wid, id, (body as { quantity: number }).quantity);
  }
  const qty = hasSized && quantityBySizeRaw
    ? quantityBySizeRaw.reduce((s, e) => s + Math.max(0, Math.floor(Number(e.quantity) ?? 0)), 0)
    : typeof (body as { quantity?: number }).quantity === 'number'
      ? (body as { quantity: number }).quantity
      : await getQuantity(wid, id);
  const outRow = data as WarehouseProductRow;
  if (hasSized && quantityBySizeRaw) {
    const sizeLabels = await getSizeCodes().then((list) => new Map(list.map((s) => [s.size_code, s.size_label])));
    const quantityBySize = quantityBySizeRaw.map((e) => ({
      sizeCode: String(e.sizeCode ?? '').trim().replace(/\s+/g, '').toUpperCase() || 'NA',
      sizeLabel: sizeLabels.get(String(e.sizeCode ?? '').trim().replace(/\s+/g, '').toUpperCase()) ?? e.sizeCode,
      quantity: Math.max(0, Math.floor(Number(e.quantity) ?? 0)),
    }));
    return rowToApi(outRow, qty, quantityBySize);
  }
  return rowToApi(outRow, qty);
}

/** DELETE one. */
export async function deleteWarehouseProduct(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

/** DELETE many by ids. */
export async function deleteWarehouseProductsBulk(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = getSupabase();
  const { error } = await supabase.from(TABLE).delete().in('id', ids);
  if (error) throw error;
}
