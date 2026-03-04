/**
 * Warehouse products list and create. List response includes images for POS/Inventory.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';

export interface ListOptions {
  limit?: number;
  offset?: number;
  q?: string;
  category?: string;
  lowStock?: boolean;
  outOfStock?: boolean;
  /** When set, passed to fetch() for all Supabase queries so the request can be aborted (e.g. timeout). */
  signal?: AbortSignal;
}

export interface ListResult {
  data: ListProduct[];
  total: number;
}

export interface ListProduct {
  id: string;
  warehouseId: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  category: string;
  sizeKind: string;
  sellingPrice: number;
  costPrice: number;
  reorderLevel: number;
  quantity: number;
  quantityBySize: Array<{ sizeCode: string; sizeLabel?: string; quantity: number }>;
  location: unknown;
  supplier: unknown;
  tags: unknown[];
  images: string[];
  color: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Alias for ListProduct (dashboard stats and other consumers). */
export type ProductRecord = ListProduct;

export interface PutProductBody {
  id?: string;
  warehouseId?: string;
  warehouse_id?: string;
  sku?: string;
  name?: string;
  category?: string;
  sellingPrice?: number;
  costPrice?: number;
  sizeKind?: string;
  quantity?: number;
  quantityBySize?: Array<{ sizeCode: string; quantity: number }>;
  images?: string[];
  color?: string | null;
  [key: string]: unknown;
}

function getDb(): SupabaseClient {
  return getSupabase();
}

/** Turn DB constraint errors into clear 400-style messages for the client. */
function normalizeDbConstraintError(dbMessage: string, action: 'create' | 'update'): string {
  const notNullMatch = dbMessage.match(/null value in column "([^"]+)" of relation "[^"]+" violates not-null constraint/i);
  if (notNullMatch) {
    const col = notNullMatch[1];
    const field =
      col === 'barcode' ? 'Barcode' : col === 'description' ? 'Description' : col === 'name' ? 'Product name' : col.replace(/_/g, ' ');
    return `Product ${action}: ${field} is required.`;
  }
  return `Failed to ${action} product: ${dbMessage}`;
}

/**
 * Columns for warehouse_products when table has no warehouse_id (one row per product).
 * Quantity is resolved from warehouse_inventory / warehouse_inventory_by_size per warehouse.
 */
const WAREHOUSE_PRODUCTS_SELECT =
  'id, sku, barcode, name, description, category, size_kind, selling_price, cost_price, reorder_level, location, supplier, tags, images, color, version, created_at, updated_at';

/** Minimal select when size_kind/color columns are missing (legacy DB). */
const WAREHOUSE_PRODUCTS_SELECT_MINIMAL =
  'id, sku, barcode, name, description, category, selling_price, cost_price, reorder_level, location, supplier, tags, images, version, created_at, updated_at';

function isMissingColumnError(err: { message?: string }): boolean {
  const m = (err?.message ?? '').toLowerCase();
  return m.includes('column') && (m.includes('does not exist') || m.includes('undefined'));
}

function isStatementTimeoutError(err: { message?: string }): boolean {
  const m = (err?.message ?? '').toLowerCase();
  return m.includes('statement timeout') || m.includes('canceling statement due to statement timeout');
}

/** List products for a warehouse. Works when warehouse_products has no warehouse_id (one row per product). */
export async function getWarehouseProducts(
  warehouseId: string | undefined,
  options: ListOptions = {}
): Promise<ListResult> {
  const db = getDb();
  const limit = Math.min(Math.max(options.limit ?? 250, 1), 250);
  const offset = Math.max(options.offset ?? 0, 0);
  const effectiveWarehouseId = warehouseId ?? '';
  const fetchOpts = options.signal ? { fetch: { signal: options.signal } as RequestInit } : undefined;
  type SelectOpts = { count?: 'exact'; head?: boolean };
  const selectOpts = (opts: SelectOpts = {}): SelectOpts & typeof fetchOpts =>
    ({ ...opts, ...fetchOpts } as SelectOpts & typeof fetchOpts);

  // warehouse_products has no warehouse_id — products are global; inventory is per-warehouse.
  function buildBaseQuery() {
    let q = db
      .from('warehouse_products')
      .select(WAREHOUSE_PRODUCTS_SELECT, selectOpts({ count: 'exact' }))
      .order('name')
      .range(offset, offset + limit - 1);
    if (options.q?.trim()) {
      const search = options.q.trim();
      q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }
    if (options.category?.trim()) {
      q = q.eq('category', options.category.trim());
    }
    return q;
  }

  // Step 1: warehouse_products (bounded by limit/offset). Steps 2–3: inventory + by_size only for this page's product IDs (bounded).
  const productsResult = await buildBaseQuery();

  let rows: Record<string, unknown>[] | null = (productsResult as { data: Record<string, unknown>[] | null }).data;
  let count: number | null = (productsResult as { count: number | null }).count ?? null;
  let error: { message: string } | null = (productsResult as { error: { message: string } | null }).error;

  if (error && isStatementTimeoutError(error)) {
    throw new Error(error.message);
  }

  if (error && isMissingColumnError(error)) {
    const retry = await buildBaseQuery();
    if (!retry.error) {
      rows = retry.data ?? [];
      count = retry.count ?? (rows as unknown[]).length;
      error = null;
    } else if (isMissingColumnError(retry.error)) {
      let fallbackQuery = db
        .from('warehouse_products')
        .select(WAREHOUSE_PRODUCTS_SELECT_MINIMAL, selectOpts({ count: 'exact' }))
        .order('name')
        .range(offset, offset + limit - 1);
      if (options.q?.trim()) {
        const q = options.q.trim();
        fallbackQuery = fallbackQuery.or(`name.ilike.%${q}%,sku.ilike.%${q}%`);
      }
      if (options.category?.trim()) {
        fallbackQuery = fallbackQuery.eq('category', options.category.trim());
      }
      const fallback = await fallbackQuery;
      if (fallback.error) throw new Error(`Failed to list products: ${fallback.error.message}`);
      rows = fallback.data ?? [];
      count = fallback.count ?? (rows as unknown[]).length;
      error = null;
    } else {
      throw new Error(`Failed to list products: ${retry.error.message}`);
    }
  }

  if (error) {
    throw new Error(`Failed to list products: ${error.message}`);
  }

  const list = (rows ?? []) as Record<string, unknown>[];
  const productIds = list.map((r) => r.id as string);
  const productIdSet = new Set(productIds);

  const invMap: Record<string, number> = {};
  const sizeMap: Record<string, Array<{ sizeCode: string; sizeLabel?: string; quantity: number }>> = {};

  // Fetch inventory and by_size only for this page's product IDs (bounded; no unbounded full-warehouse read).
  type SizeRow = { product_id: string; size_code: string; quantity: number; size_codes?: { size_label?: string } | null };
  let inventoryResult: { data: { product_id: string; quantity?: number }[] | null; error: { message: string } | null } = { data: [], error: null };
  let sizesResult: { data: SizeRow[] | null; error: { message: string } | null } = { data: [], error: null };
  if (effectiveWarehouseId && productIds.length > 0) {
    const [invRes, sizeRes] = await Promise.all([
      db
        .from('warehouse_inventory')
        .select('product_id, quantity', selectOpts())
        .eq('warehouse_id', effectiveWarehouseId)
        .in('product_id', productIds),
      db
        .from('warehouse_inventory_by_size')
        .select('product_id, size_code, quantity, size_codes!left(size_label)', selectOpts())
        .eq('warehouse_id', effectiveWarehouseId)
        .in('product_id', productIds),
    ]);
    inventoryResult = invRes as typeof inventoryResult;
    sizesResult = { data: (sizeRes.data ?? []) as SizeRow[], error: sizeRes.error };
  }

  if (effectiveWarehouseId && productIds.length > 0) {
    if (inventoryResult.error) {
      console.error('[warehouseProducts] warehouse_inventory query failed:', inventoryResult.error.message);
    } else {
      const invData = (inventoryResult.data ?? []) as { product_id: string; quantity?: number }[];
      for (const inv of invData) {
        if (productIdSet.has(inv.product_id)) {
          invMap[inv.product_id] = Number(inv.quantity ?? 0);
        }
      }
    }

    let sizeRows: SizeRow[] = [];
    if (sizesResult.error && (sizesResult.error.message?.includes('relation') || sizesResult.error.message?.includes('size_codes'))) {
      const withoutJoin = await db
        .from('warehouse_inventory_by_size')
        .select('product_id, size_code, quantity', selectOpts())
        .eq('warehouse_id', effectiveWarehouseId)
        .in('product_id', productIds);
      if (!withoutJoin.error) sizeRows = (withoutJoin.data ?? []) as SizeRow[];
    } else if (!sizesResult.error) {
      const sizeData = (sizesResult.data ?? []) as SizeRow[];
      sizeRows = sizeData.filter((r) => productIdSet.has(r.product_id));
    }
    for (const r of sizeRows) {
      if (!sizeMap[r.product_id]) sizeMap[r.product_id] = [];
      sizeMap[r.product_id].push({
        sizeCode: String(r.size_code),
        sizeLabel: r.size_codes?.size_label ?? r.size_code,
        quantity: Number(r.quantity ?? 0),
      });
    }
  }

  const data = list.map((row) => {
    const sizes = (sizeMap[row.id as string] ?? []).sort((a, b) =>
      a.sizeCode.localeCompare(b.sizeCode)
    );
    const isSized = (row.size_kind as string) === 'sized' && sizes.length > 0;
    const quantity = isSized
      ? sizes.reduce((s, r) => s + r.quantity, 0)
      : invMap[row.id as string] ?? 0;

    if (options.lowStock && quantity > (Number(row.reorder_level ?? 0) || 3)) return null;
    if (options.outOfStock && quantity > 0) return null;

    return {
      id: String(row.id ?? ''),
      warehouseId: effectiveWarehouseId,
      sku: String(row.sku ?? ''),
      barcode: row.barcode ?? null,
      name: String(row.name ?? ''),
      description: row.description ?? null,
      category: String(row.category ?? ''),
      sizeKind: String(row.size_kind ?? 'na'),
      sellingPrice: Number(row.selling_price ?? 0),
      costPrice: Number(row.cost_price ?? 0),
      reorderLevel: Number(row.reorder_level ?? 0),
      quantity,
      quantityBySize: sizes,
      location: row.location ?? null,
      supplier: row.supplier ?? null,
      tags: Array.isArray(row.tags) ? row.tags : [],
      images: Array.isArray(row.images) ? (row.images as string[]) : [],
      color: row.color != null ? String(row.color).trim() || null : null,
      version: Number(row.version ?? 0),
      createdAt: String(row.created_at ?? ''),
      updatedAt: String(row.updated_at ?? ''),
    };
  }).filter((p) => p !== null) as ListProduct[];

  // When a warehouse is selected, only return products that exist in inventory for that warehouse.
  const filtered =
    effectiveWarehouseId === ''
      ? data
      : data.filter(
          (p) => invMap[p.id] !== undefined || (sizeMap[p.id]?.length ?? 0) > 0
        );

  // Return full count so the client can paginate (fetch all pages). When warehouse is set we still
  // return only filtered rows for this page, but total must be the full list count, not this page's length.
  const total = count ?? data.length;
  return {
    data: filtered,
    total,
  };
}

/** Get one product by id and warehouse (for GET ?id=). Works when warehouse_products has no warehouse_id. */
export async function getProductById(
  warehouseId: string,
  productId: string
): Promise<ListProduct | null> {
  const db = getDb();
  const { data: row } = await db
    .from('warehouse_products')
    .select(WAREHOUSE_PRODUCTS_SELECT)
    .eq('id', productId)
    .single();

  if (!row) return null;

  const r = row as Record<string, unknown>;

  let quantity = 0;
  const { data: invRow } = await db
    .from('warehouse_inventory')
    .select('quantity')
    .eq('warehouse_id', warehouseId)
    .eq('product_id', productId)
    .maybeSingle();
  const { data: sizeRows } = await db
    .from('warehouse_inventory_by_size')
    .select('size_code, quantity, size_codes!left(size_label)')
    .eq('warehouse_id', warehouseId)
    .eq('product_id', productId);
  const sizes = ((sizeRows ?? []) as Array<{ size_code: string; quantity: number; size_codes?: { size_label?: string } | null }>)
    .map((s) => ({
      sizeCode: String(s.size_code),
      sizeLabel: s.size_codes?.size_label ?? s.size_code,
      quantity: Number(s.quantity ?? 0),
    }))
    .sort((a, b) => a.sizeCode.localeCompare(b.sizeCode));
  const isSized = (r.size_kind as string) === 'sized' && sizes.length > 0;
  quantity = isSized ? sizes.reduce((s, x) => s + x.quantity, 0) : Number((invRow as { quantity?: number } | null)?.quantity ?? 0);

  return {
    id: String(r.id ?? ''),
    warehouseId,
    sku: String(r.sku ?? ''),
    barcode: r.barcode != null ? String(r.barcode) : null,
    name: String(r.name ?? ''),
    description: r.description != null ? String(r.description) : null,
    category: String(r.category ?? ''),
    sizeKind: String(r.size_kind ?? 'na'),
    sellingPrice: Number(r.selling_price ?? 0),
    costPrice: Number(r.cost_price ?? 0),
    reorderLevel: Number(r.reorder_level ?? 0),
    quantity,
    quantityBySize: sizes,
    location: r.location ?? null,
    supplier: r.supplier ?? null,
    tags: Array.isArray(r.tags) ? r.tags : [],
    images: Array.isArray(r.images) ? (r.images as string[]) : [],
    color: r.color != null ? String(r.color).trim() || null : null,
    version: Number(r.version ?? 0),
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

/**
 * Create product: insert into warehouse_products, then warehouse_inventory (and warehouse_inventory_by_size when sized).
 * Body may use camelCase (from frontend); we normalize to DB snake_case.
 * Returns the created product in ListProduct shape for client UI.
 */
export async function createWarehouseProduct(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const db = getDb();

  const warehouseId = String(body.warehouseId ?? body.warehouse_id ?? '').trim();
  if (!warehouseId) {
    throw new Error('warehouseId is required');
  }

  const name = String(body.name ?? '').trim();
  if (!name) {
    throw new Error('Product name is required');
  }

  const id = (typeof body.id === 'string' && body.id.trim() ? body.id.trim() : crypto.randomUUID()) as string;
  const sku = String(body.sku ?? '').trim() || `SKU-${id.slice(0, 8)}`;
  /** DB has NOT NULL on barcode; coerce null/undefined to empty string to avoid constraint violation. */
  const barcode = (body.barcode != null ? String(body.barcode).trim() : '') || '';
  /** DB may have NOT NULL on description; coerce to empty string. */
  const description = (body.description != null ? String(body.description).trim() : '') || '';
  const category = String(body.category ?? 'Uncategorized').trim();
  const sizeKind = String(body.sizeKind ?? body.size_kind ?? 'na').trim().toLowerCase();
  const sellingPrice = Number(body.sellingPrice ?? body.selling_price ?? 0);
  const costPrice = Number(body.costPrice ?? body.cost_price ?? 0);
  const reorderLevel = Number(body.reorderLevel ?? body.reorder_level ?? 0);
  const quantityBySize = Array.isArray(body.quantityBySize) ? body.quantityBySize as Array<{ sizeCode: string; quantity: number }> : [];
  const quantity = Number(body.quantity ?? 0);
  const now = new Date().toISOString();

  const colorVal = body.color != null ? String(body.color).trim() || null : null;
  const productRow = {
    id,
    sku,
    barcode,
    name,
    description,
    category,
    size_kind: sizeKind === 'one_size' ? 'one_size' : sizeKind === 'sized' ? 'sized' : 'na',
    selling_price: sellingPrice,
    cost_price: costPrice,
    reorder_level: reorderLevel,
    location: body.location ?? null,
    supplier: body.supplier ?? null,
    tags: Array.isArray(body.tags) ? body.tags : [],
    images: Array.isArray(body.images) ? body.images : [],
    color: colorVal,
    version: 1,
    created_at: now,
    updated_at: now,
  };

  const { error: insertProductError } = await db.from('warehouse_products').insert(productRow);
  if (insertProductError) {
    throw new Error(normalizeDbConstraintError(insertProductError.message, 'create'));
  }

  const isSized = sizeKind === 'sized' && quantityBySize.length > 0;
  const totalQty = isSized
    ? quantityBySize.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
    : Number(quantity) || 0;

  const { error: insertInvError } = await db.from('warehouse_inventory').insert({
    product_id: id,
    warehouse_id: warehouseId,
    quantity: totalQty,
  });
  if (insertInvError) {
    await db.from('warehouse_products').delete().eq('id', id);
    throw new Error(`Failed to create warehouse inventory: ${insertInvError.message}`);
  }

  if (isSized && quantityBySize.length > 0) {
    const sizeRows = quantityBySize
      .filter((r) => String(r.sizeCode ?? '').trim())
      .map((r) => ({
        product_id: id,
        warehouse_id: warehouseId,
        size_code: String(r.sizeCode).trim().toUpperCase(),
        quantity: Number(r.quantity) || 0,
      }));
    if (sizeRows.length > 0) {
      const { error: insertSizeError } = await db.from('warehouse_inventory_by_size').insert(sizeRows);
      if (insertSizeError) {
        await db.from('warehouse_inventory').delete().eq('product_id', id).eq('warehouse_id', warehouseId);
        await db.from('warehouse_products').delete().eq('id', id);
        throw new Error(`Failed to create inventory by size: ${insertSizeError.message}`);
      }
    }
  }

  const quantityBySizeOut = isSized
    ? quantityBySize.map((r) => ({ sizeCode: String(r.sizeCode), sizeLabel: String(r.sizeCode), quantity: Number(r.quantity) || 0 }))
    : [];

  return {
    id,
    warehouseId,
    sku,
    barcode,
    name,
    description,
    category,
    sizeKind: productRow.size_kind,
    sellingPrice,
    costPrice,
    reorderLevel,
    quantity: totalQty,
    quantityBySize: quantityBySizeOut,
    location: productRow.location,
    supplier: productRow.supplier,
    tags: productRow.tags,
    images: productRow.images,
    color: colorVal,
    version: productRow.version,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update product: patch warehouse_products, then replace warehouse_inventory and warehouse_inventory_by_size for the given warehouse.
 * Body may use camelCase; only provided fields are updated. Returns updated product in ListProduct shape.
 */
export async function updateWarehouseProduct(
  productId: string,
  warehouseId: string,
  body: PutProductBody
): Promise<ListProduct | null> {
  const db = getDb();

  const existing = await getProductById(warehouseId, productId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };

  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (body.sku !== undefined) updates.sku = String(body.sku).trim();
  /** DB has NOT NULL on barcode; coerce null to empty string. */
  if (body.barcode !== undefined) updates.barcode = (body.barcode != null ? String(body.barcode).trim() : '') || '';
  /** DB may have NOT NULL on description; coerce to empty string. */
  if (body.description !== undefined) updates.description = (body.description != null ? String(body.description).trim() : '') || '';
  if (body.category !== undefined) updates.category = String(body.category).trim();
  if (body.sizeKind !== undefined) updates.size_kind = String(body.sizeKind).trim().toLowerCase();
  if (body.sellingPrice !== undefined) updates.selling_price = Number(body.sellingPrice);
  if (body.costPrice !== undefined) updates.cost_price = Number(body.costPrice);
  if (body.reorderLevel !== undefined) updates.reorder_level = Number(body.reorderLevel);
  if (body.location !== undefined) updates.location = body.location;
  if (body.supplier !== undefined) updates.supplier = body.supplier;
  if (body.tags !== undefined) updates.tags = Array.isArray(body.tags) ? body.tags : [];
  if (body.images !== undefined) updates.images = Array.isArray(body.images) ? body.images : [];
  if (body.color !== undefined) updates.color = body.color != null ? String(body.color).trim() || null : null;

  updates.version = (existing.version ?? 0) + 1;

  const { error: updateError } = await db
    .from('warehouse_products')
    .update(updates)
    .eq('id', productId);
  if (updateError) {
    throw new Error(normalizeDbConstraintError(updateError.message, 'update'));
  }

  const sizeKind = String(body.sizeKind ?? existing.sizeKind ?? 'na').toLowerCase();
  const quantityBySize = Array.isArray(body.quantityBySize) ? body.quantityBySize as Array<{ sizeCode: string; quantity: number }> : [];
  const isSized = sizeKind === 'sized' && quantityBySize.length > 0;
  const totalQty = isSized
    ? quantityBySize.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
    : Number(body.quantity ?? existing.quantity ?? 0);

  await db.from('warehouse_inventory_by_size').delete().eq('product_id', productId).eq('warehouse_id', warehouseId);
  const { error: delInvErr } = await db
    .from('warehouse_inventory')
    .delete()
    .eq('product_id', productId)
    .eq('warehouse_id', warehouseId);
  if (delInvErr) {
    throw new Error(`Failed to clear warehouse inventory for update: ${delInvErr.message}`);
  }
  const { error: insertInvErr } = await db.from('warehouse_inventory').insert({
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: totalQty,
  });
  if (insertInvErr) {
    throw new Error(`Failed to update warehouse inventory: ${insertInvErr.message}`);
  }

  if (isSized && quantityBySize.length > 0) {
    const sizeRows = quantityBySize
      .filter((r) => String(r.sizeCode ?? '').trim())
      .map((r) => ({
        product_id: productId,
        warehouse_id: warehouseId,
        size_code: String(r.sizeCode).trim().toUpperCase(),
        quantity: Number(r.quantity) || 0,
      }));
    if (sizeRows.length > 0) {
      const { error: insertSizeError } = await db.from('warehouse_inventory_by_size').insert(sizeRows);
      if (insertSizeError) {
        throw new Error(`Failed to update inventory by size: ${insertSizeError.message}`);
      }
    }
  }

  return getProductById(warehouseId, productId);
}

/**
 * Delete product: remove all inventory and by-size rows for this product, then delete the product row.
 * Product is removed from every warehouse so it does not reappear on list poll.
 */
export async function deleteWarehouseProduct(productId: string, _warehouseId: string): Promise<void> {
  const db = getDb();

  const { error: delSizeErr } = await db
    .from('warehouse_inventory_by_size')
    .delete()
    .eq('product_id', productId);
  if (delSizeErr) {
    throw new Error(`Failed to delete inventory by size: ${delSizeErr.message}`);
  }

  const { error: delInvErr } = await db
    .from('warehouse_inventory')
    .delete()
    .eq('product_id', productId);
  if (delInvErr) {
    throw new Error(`Failed to delete warehouse inventory: ${delInvErr.message}`);
  }

  const { error: delProdErr } = await db.from('warehouse_products').delete().eq('id', productId);
  if (delProdErr) {
    throw new Error(`Failed to delete product: ${delProdErr.message}`);
  }
}

/** Stub: bulk delete. Implement when needed. */
export async function deleteWarehouseProductsBulk(_ids: string[]): Promise<{ deleted: number }> {
  return { deleted: 0 };
}
