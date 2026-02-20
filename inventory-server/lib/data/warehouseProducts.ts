/**
 * Warehouse products API — single source of truth in this repo.
 * Table: warehouse_products (no quantity column after migration); quantity lives in warehouse_inventory.
 * Used by GET/POST/PUT/DELETE /api/products and /admin/api/products.
 * All quantity read/write is scoped by warehouse_id.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getDefaultWarehouseId } from './warehouses';
import { getQuantitiesForProducts, getQuantity, ensureQuantity, setQuantity } from './warehouseInventory';
import { getQuantitiesBySize, setQuantitiesBySize, type QuantityBySizeEntry } from './warehouseInventoryBySize';
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
  const sizeKind = (row.size_kind ?? (row as { sizeKind?: string }).sizeKind ?? 'na') as string;
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
  // Structural correction: API always returns quantityBySize as array, never null/undefined (product list + POS rely on this).
  out.quantityBySize = Array.isArray(quantityBySize) ? quantityBySize : [];
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

/** Row from warehouse_inventory_by_size when fetched without embed (no FK to size_codes in DB). */
type BySizeRow = {
  product_id: string;
  size_code: string;
  quantity: number;
};

/** Map: size_code -> { size_label, size_order } from size_codes table. */
type SizeCodeMap = Map<string, { size_label: string; size_order: number }>;

/** Normalize by-size rows into quantityBySize and sizes. Sorted by size_order from sizeCodeMap; label from map or fallback to size_code. */
function normalizeBySizeRows(
  bySizeRows: BySizeRow[] | null | undefined,
  sizeCodeMap: SizeCodeMap
): { quantityBySize: Array<{ sizeCode: string; sizeLabel?: string; quantity: number }>; sizes: Array<{ size: string; quantity: number }> } {
  const list = Array.isArray(bySizeRows) ? bySizeRows : [];
  const sorted = [...list].sort(
    (a, b) => (sizeCodeMap.get(a.size_code)?.size_order ?? 0) - (sizeCodeMap.get(b.size_code)?.size_order ?? 0)
  );
  const quantityBySize = sorted.map((e) => ({
    sizeCode: e.size_code,
    sizeLabel: sizeCodeMap.get(e.size_code)?.size_label ?? e.size_code,
    quantity: Number(e.quantity),
  }));
  const sizes = sorted.map((e) => ({
    size: sizeCodeMap.get(e.size_code)?.size_label ?? e.size_code,
    quantity: Number(e.quantity),
  }));
  return { quantityBySize, sizes };
}

/** GET warehouse products with optional pagination, search, and filters. Quantity is for the given warehouse. */
/** Prefers DB RPC get_products_with_sizes when available (single source of truth for sizes); falls back to two-query + merge. */
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

  // Brute-force: only path that can return list with sizes is the DB RPC (no PostgREST embed = no PGRST200).
  const { data: rpcRows, error: rpcError } = await supabase.rpc('get_products_with_sizes', {
    p_warehouse_id: wid,
    p_limit: limit,
    p_offset: offset,
    p_search: q || null,
    p_category: category || null,
  });

  const rpcMissing =
    rpcError &&
    (rpcError.code === '42883' ||
      /function.*does not exist|could not find the function|relation.*does not exist/i.test(String(rpcError.message)));
  if (rpcMissing) {
    throw new Error(
      'Product list requires DB migration. In Supabase SQL Editor run: inventory-server/supabase/migrations/20250218100000_get_products_with_sizes_rpc.sql'
    );
  }

  if (!rpcError && Array.isArray(rpcRows) && rpcRows.length > 0) {
    const row = rpcRows[0] as { data?: unknown[]; total?: number };
    let data: Record<string, unknown>[] = Array.isArray(row.data) ? (row.data as Record<string, unknown>[]) : [];
    const total = typeof row.total === 'number' ? row.total : data.length;
    if (pos && data.length > 0) {
      data = data.map((p) => {
        const quantityBySize = (p.quantityBySize as Array<{ sizeCode: string; quantity: number }>) ?? [];
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          sellingPrice: p.sellingPrice,
          reorderLevel: p.reorderLevel,
          quantity: p.quantity,
          updatedAt: p.updatedAt,
          quantityBySize,
          sizes: (p.sizes as Array<{ size: string; quantity: number }>) ?? [],
        };
      });
    }
    if (lowStock || outOfStock) {
      data = data.filter((p) => {
        const qty = Number((p as { quantity?: number }).quantity ?? 0);
        const reorder = Number((p as { reorderLevel?: number }).reorderLevel ?? 0);
        if (outOfStock && qty === 0) return true;
        if (lowStock && qty > 0 && qty <= reorder) return true;
        return false;
      });
    }
    return { data, total: total ?? undefined };
  }

  // Fallback only when RPC exists but returned an error other than "missing" (e.g. timeout). No embed on by_size.
  const listSelect = pos
    ? 'id, name, sku, barcode, selling_price, reorder_level, updated_at, size_kind'
    : '*';
  const selectOpts = { count: 'exact' as const };
  let query = supabase
    .from(TABLE)
    .select(listSelect, selectOpts)
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

  const { data: sizeInventoryRows, error: sizeError } = await supabase
    .from('warehouse_inventory_by_size')
    .select('product_id, size_code, quantity')
    .eq('warehouse_id', wid)
    .in('product_id', ids);
  if (sizeError) throw sizeError;
  const sizeInventory: BySizeRow[] = (sizeInventoryRows ?? []) as unknown as BySizeRow[];

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console -- intentional: verify warehouse filter changes size inventory
    console.log('[getWarehouseProducts] Selected Warehouse:', wid);
    // eslint-disable-next-line no-console -- intentional: verify size inventory is scoped
    console.log('[getWarehouseProducts] Size inventory row count:', sizeInventory.length, sizeInventory.length ? '(sample product_id: ' + sizeInventory[0].product_id + ')' : '');
  }

  const sizeInventoryByProduct = new Map<string, BySizeRow[]>();
  for (const row of sizeInventory) {
    const list = sizeInventoryByProduct.get(row.product_id) ?? [];
    list.push(row);
    sizeInventoryByProduct.set(row.product_id, list);
  }

  const [quantities, sizeCodesList] = await Promise.all([
    getQuantitiesForProducts(wid, ids),
    pos ? Promise.resolve([] as { size_code: string; size_label: string; size_order: number }[]) : getSizeCodes(),
  ]);
  const sizeCodeMap: SizeCodeMap = new Map(
    sizeCodesList.map((s) => [s.size_code, { size_label: s.size_label, size_order: s.size_order }])
  );

  let merged: Record<string, unknown>[];
  if (pos) {
    merged = productRows.map((row) => {
      const qty = quantities.get(row.id) ?? 0;
      const bySizeRows = sizeInventoryByProduct.get(row.id) ?? [];
      const norm = normalizeBySizeRows(bySizeRows, sizeCodeMap);
      const quantityBySize = norm.quantityBySize.map((e) => ({ sizeCode: e.sizeCode, quantity: e.quantity }));
      const sizes = norm.sizes;
      const out = posRowToApi(row, qty, quantityBySize);
      out.sizes = sizes;
      return out;
    });
  } else {
    merged = productRows.map((row) => {
      const qty = quantities.get(row.id) ?? 0;
      const isSizedByKind = (row.size_kind ?? (row as { sizeKind?: string }).sizeKind ?? 'na') === 'sized';
      const bySizeRows = sizeInventoryByProduct.get(row.id) ?? [];
      const norm = normalizeBySizeRows(bySizeRows, sizeCodeMap);
      const quantityBySizeMapped = norm.quantityBySize;
      const sizes = norm.sizes;
      const hasBySizeData = quantityBySizeMapped.length > 0;
      const quantityBySize = (isSizedByKind || hasBySizeData) ? quantityBySizeMapped : undefined;
      const out = rowToApi(row, qty, quantityBySize);
      out.sizes = sizes;
      return out;
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
  quantityBySize: Array<{ sizeCode: string; quantity: number }> = []
): Record<string, unknown> {
  // Normalize: API always returns quantityBySize as array, never null (POS and list rely on this).
  const out: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode ?? '',
    sellingPrice: row.selling_price,
    reorderLevel: row.reorder_level ?? 0,
    quantity,
    version: row.version ?? 0,
    updatedAt: row.updated_at,
    quantityBySize: Array.isArray(quantityBySize) ? quantityBySize : [],
  };
  return out;
}

/** GET one by id. Quantity and sizes for the given warehouseId (default if omitted). Uses get_product_with_sizes RPC when available (same source of truth as list). */
export async function getWarehouseProductById(id: string, warehouseId?: string): Promise<Record<string, unknown> | null> {
  const supabase = getSupabase();
  const wid = (warehouseId?.trim?.() && warehouseId) ? warehouseId : getDefaultWarehouseId();

  const { data: rpcRows, error: rpcError } = await supabase.rpc('get_product_with_sizes', {
    p_warehouse_id: wid,
    p_product_id: id,
  });
  if (!rpcError && Array.isArray(rpcRows) && rpcRows.length > 0) {
    const row = rpcRows[0] as { data?: unknown };
    if (row?.data != null && typeof row.data === 'object') return row.data as Record<string, unknown>;
  }

  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as WarehouseProductRow;
  const qty = await getQuantity(wid, id);
  const isSizedByKind = (row.size_kind ?? (row as { sizeKind?: string }).sizeKind ?? 'na') === 'sized';
  const bySize = await getQuantitiesBySize(wid, id);
  if (isSizedByKind || bySize.length > 0) {
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

/** Reusable validation: size type "sized" requires at least one size row. Use before create/update. */
function validateSizeKindAndQuantityBySize(
  sizeKind: unknown,
  quantityBySize: unknown
): void {
  const kind = String(sizeKind ?? 'na').toLowerCase();
  const list = Array.isArray(quantityBySize) ? quantityBySize : [];
  const hasValidRows = list.some((e: unknown) => e && typeof e === 'object' && String((e as { sizeCode?: string }).sizeCode ?? '').trim() !== '');
  if (kind === 'sized' && !hasValidRows) {
    const err = new Error('When size type is Multiple sizes, add at least one size row (e.g. S, M, L with quantities).') as Error & { status?: number };
    err.status = 400;
    throw err;
  }
}

/** POST: create one. Direct Supabase: insert product, then inventory + by_size. */
export async function createWarehouseProduct(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  validateSizeKindAndQuantityBySize(body.sizeKind ?? body.size_kind, body.quantityBySize);

  const supabase = getSupabase();
  const id: string = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : crypto.randomUUID();
  const ts = now();
  const wid = (body.warehouseId as string) ?? getDefaultWarehouseId();
  const quantityBySizeRaw = body.quantityBySize as Array<{ sizeCode: string; quantity: number }> | undefined;
  const hasSized = Array.isArray(quantityBySizeRaw) && quantityBySizeRaw.length > 0;
  const row = bodyToRow(body, id, ts) as Record<string, unknown> & { size_kind: string };
  if (hasSized) row.size_kind = 'sized';

  const { data: outRow, error: insertError } = await supabase.from(TABLE).insert(row).select().single();
  if (insertError) throw insertError;

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

  const qty = hasSized
    ? (quantityBySizeRaw as QuantityBySizeEntry[]).reduce((s, e) => s + Math.max(0, Math.floor(Number(e.quantity) ?? 0)), 0)
    : Number(body.quantity) ?? 0;
  let created = await getWarehouseProductById(id, wid);
  if (hasSized && quantityBySizeRaw?.length && created && (!Array.isArray((created as { quantityBySize?: unknown[] }).quantityBySize) || (created as { quantityBySize: unknown[] }).quantityBySize.length === 0)) {
    const sizeLabels = await getSizeCodes().then((list) => new Map(list.map((s) => [s.size_code, s.size_label])));
    created = {
      ...created,
      quantityBySize: quantityBySizeRaw.map((e) => {
        const code = String(e.sizeCode ?? '').trim().replace(/\s+/g, '').toUpperCase() || 'NA';
        return { sizeCode: code, sizeLabel: sizeLabels.get(code) ?? code, quantity: Math.max(0, Math.floor(Number(e.quantity) ?? 0)) };
      }),
      sizeKind: 'sized',
    } as Record<string, unknown>;
  }
  const fallbackQtyBySize = hasSized && quantityBySizeRaw
    ? quantityBySizeRaw.map((e) => {
        const code = String(e.sizeCode ?? '').trim().replace(/\s+/g, '').toUpperCase() || 'NA';
        return { sizeCode: code, sizeLabel: code, quantity: Math.max(0, Math.floor(Number(e.quantity) ?? 0)) };
      })
    : undefined;
  return created ?? rowToApi(outRow as WarehouseProductRow, qty, fallbackQtyBySize);
}

/**
 * Normalize body quantityBySize to array of { sizeCode, quantity }.
 * Whatever array arrives is the truth — no filtering, no preservation. Empty array is valid.
 */
function normalizeQuantityBySizeFromBody(body: Record<string, unknown>): Array<{ sizeCode: string; quantity: number }> {
  const raw =
    (body as { quantityBySize?: Array<{ sizeCode?: string; size_code?: string; quantity?: number }> }).quantityBySize ??
    (body as { quantity_by_size?: Array<{ sizeCode?: string; size_code?: string; quantity?: number }> }).quantity_by_size;
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => ({
    sizeCode: String(e?.sizeCode ?? e?.size_code ?? '')
      .trim()
      .replace(/\s+/g, '')
      .toUpperCase(),
    quantity: Math.max(0, Math.floor(Number(e?.quantity ?? 0))),
  }));
}

/** PUT: update one product. Whatever quantityBySize array arrives becomes the truth — no preservation, no filtering, no special branches. */
export async function updateWarehouseProduct(
  id: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const wid = (body.warehouseId as string)?.trim() || getDefaultWarehouseId();

  const existing = await getWarehouseProductById(id, wid);
  if (!existing) {
    const err = new Error('Product not found') as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  const currentVersion = Number(existing.version ?? 0);
  const ts = now();

  const bodySizeKind = (
    (body as { sizeKind?: string }).sizeKind ??
    (body as { size_kind?: string }).size_kind ??
    (existing as { sizeKind?: string }).sizeKind ??
    (existing as { size_kind?: string }).size_kind ??
    'na'
  ).toLowerCase() as 'na' | 'one_size' | 'sized';

  const quantityBySize = normalizeQuantityBySizeFromBody(body);

  const row = bodyToRow(
    { ...existing, ...body, id, updatedAt: ts, version: currentVersion + 1 },
    id,
    ts
  );
  (row as { size_kind: string }).size_kind = bodySizeKind;

  let pQuantity: number;
  let pQuantityBySize: Array<{ sizeCode: string; quantity: number }>;

  if (bodySizeKind === 'sized') {
    pQuantityBySize = quantityBySize;
    pQuantity = pQuantityBySize.reduce((sum, r) => sum + r.quantity, 0);
  } else {
    pQuantityBySize = [];
    pQuantity =
      typeof (body as { quantity?: number }).quantity === 'number'
        ? (body as { quantity: number }).quantity
        : Number((existing as { quantity?: number }).quantity ?? 0);
  }

  const supabase = getSupabase();
  const nextVersion = currentVersion + 1;
  const { data: updatedRow, error: updateError } = await supabase
    .from(TABLE)
    .update({ ...row, version: nextVersion })
    .eq('id', id)
    .eq('version', currentVersion)
    .select()
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updatedRow) {
    const err = new Error('Product was updated by someone else. Please refresh and try again.') as Error & { status?: number };
    err.status = 409;
    throw err;
  }

  if (bodySizeKind === 'sized') {
    await setQuantitiesBySize(wid, id, pQuantityBySize);
    await setQuantity(wid, id, pQuantity);
  } else {
    await setQuantitiesBySize(wid, id, []);
    await setQuantity(wid, id, pQuantity);
  }

  const updated = await getWarehouseProductById(id, wid);
  const out: Record<string, unknown> = (
    updated ?? rowToApi(updatedRow as WarehouseProductRow, pQuantity, bodySizeKind === 'sized' ? pQuantityBySize : undefined)
  ) as Record<string, unknown>;
  if (pQuantityBySize.length > 0) {
    const bySize = out.quantityBySize as Array<{ sizeCode?: string }> | undefined;
    if (!Array.isArray(bySize) || bySize.length === 0) {
      out.quantityBySize = pQuantityBySize.map((e) => ({ ...e, sizeLabel: e.sizeCode }));
    }
  }
  return out;
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
