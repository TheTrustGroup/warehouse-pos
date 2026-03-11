/**
 * Warehouse products list and create. List response includes images for POS/Inventory.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { getSizeCodes } from '@/lib/data/sizeCodes';

export interface ListOptions {
  limit?: number;
  offset?: number;
  q?: string;
  category?: string;
  lowStock?: boolean;
  outOfStock?: boolean;
  /** When 'list', use slimmer select (omit description, location, supplier, tags) for smaller payload. */
  view?: 'list' | 'full';
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
function normalizeDbConstraintError(dbMessage: string, action: 'create' | 'update', code?: string): string {
  if (code === '23505' || /unique constraint|duplicate key value|already exists/i.test(dbMessage)) {
    if (/sku|idx_warehouse_products_sku_unique/i.test(dbMessage)) {
      return 'A product with this SKU already exists. Use a unique SKU or edit the existing product.';
    }
  }
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

/** Slimmer select for list view — omits description, location, supplier, tags to reduce payload. */
const WAREHOUSE_PRODUCTS_SELECT_LIST =
  'id, sku, barcode, name, category, size_kind, selling_price, cost_price, reorder_level, images, color, version, created_at, updated_at';

function isStatementTimeoutError(err: { message?: string }): boolean {
  const m = (err?.message ?? '').toLowerCase();
  return m.includes('statement timeout') || m.includes('canceling statement due to statement timeout');
}

type SizeRow = { product_id: string; size_code: string; quantity: number };

/**
 * List products for a warehouse.
 * Single-path query: products + LEFT JOIN semantics for warehouse_inventory_by_size (same warehouse_id).
 * quantity_by_size and total_quantity are built from the size query only; no fallback query, no size_codes join.
 * Includes all products that have inventory in this warehouse; never drops products due to join failure.
 */
export async function getWarehouseProducts(
  warehouseId: string | undefined,
  options: ListOptions = {}
): Promise<ListResult> {
  const db = getDb();
  const limit = Math.min(Math.max(options.limit ?? 250, 1), 250);
  const offset = Math.max(options.offset ?? 0, 0);
  const effectiveWarehouseId = warehouseId ?? '';
  const fetchOpts = options.signal ? { fetch: { signal: options.signal } as RequestInit } : undefined;
  type SelectOpts = { count?: 'exact' };
  const selectOpts = (opts: SelectOpts = {}): SelectOpts & typeof fetchOpts =>
    ({ ...opts, ...fetchOpts } as SelectOpts & typeof fetchOpts);

  if (!effectiveWarehouseId) {
    return { data: [], total: 0 };
  }

  const selectColumns: string = options.view === 'list' ? WAREHOUSE_PRODUCTS_SELECT_LIST : WAREHOUSE_PRODUCTS_SELECT;
  // 1) Fetch products: warehouse_products (no warehouse_id column — one row per product). Order by name, paginate.
  let productsQuery = db
    .from('warehouse_products')
    .select(selectColumns, selectOpts({ count: 'exact' }))
    .order('name')
    .range(offset, offset + limit - 1);
  if (options.q?.trim()) {
    const search = options.q.trim();
    productsQuery = productsQuery.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
  }
  if (options.category?.trim()) {
    productsQuery = productsQuery.eq('category', options.category.trim());
  }

  const productsResult = await productsQuery;
  const rows: Record<string, unknown>[] = (productsResult as { data: Record<string, unknown>[] | null }).data ?? [];
  const error = (productsResult as { error: { message: string } | null }).error;
  const count = (productsResult as { count: number | null }).count ?? null;

  if (error) {
    if (isStatementTimeoutError(error)) throw new Error(error.message);
    throw new Error(`Failed to list products: ${error.message}`);
  }

  const productIds = rows.map((r) => String(r.id ?? ''));
  const productIdSet = new Set(productIds);
  if (productIds.length === 0) {
    return { data: [], total: count ?? 0 };
  }

  // 2) Same warehouse_id: fetch warehouse_inventory (for one-size fallback) and warehouse_inventory_by_size (for quantity_by_size + total_quantity).
  const [invRes, sizeRes] = await Promise.all([
    db
      .from('warehouse_inventory')
      .select('product_id, quantity', selectOpts())
      .eq('warehouse_id', effectiveWarehouseId)
      .in('product_id', productIds),
    db
      .from('warehouse_inventory_by_size')
      .select('product_id, size_code, quantity', selectOpts())
      .eq('warehouse_id', effectiveWarehouseId)
      .in('product_id', productIds),
  ]);

  const invData = (invRes as { data?: { product_id: string; quantity?: number }[] | null }).data ?? [];
  const sizeData = (sizeRes as { data?: SizeRow[] | null }).data ?? [];
  const invMap: Record<string, number> = {};
  for (const inv of invData) {
    const pid = String(inv.product_id ?? '');
    if (productIdSet.has(pid)) invMap[pid] = Number(inv.quantity ?? 0);
  }

  // quantity_by_size built from size rows only (same warehouse_id). Never use size_codes join or other-warehouse data.
  const sizeMap: Record<string, Array<{ sizeCode: string; sizeLabel?: string; quantity: number }>> = {};
  for (const r of sizeData) {
    const pid = String(r.product_id ?? '');
    if (!productIdSet.has(pid)) continue;
    if (!sizeMap[pid]) sizeMap[pid] = [];
    sizeMap[pid].push({
      sizeCode: String(r.size_code),
      sizeLabel: String(r.size_code),
      quantity: Number(r.quantity ?? 0),
    });
  }

  const data = rows.map((row) => {
    const rowId = String(row.id ?? '');
    let sizes = (sizeMap[rowId] ?? []).sort((a, b) => a.sizeCode.localeCompare(b.sizeCode, undefined, { numeric: true }));
    const hasSizeRows = sizes.length > 0;
    const totalQuantity = hasSizeRows ? sizes.reduce((s, r) => s + r.quantity, 0) : (invMap[rowId] ?? 0);
    const rawSizeKind = String(row.size_kind ?? 'na');
    // When product has no per-size rows but has quantity in warehouse_inventory, return a synthetic "One size" row so sizes "come back" in inventory and user can add more when editing.
    let sizeKind = rawSizeKind;
    if (!hasSizeRows && totalQuantity > 0) {
      sizes = [{ sizeCode: 'ONE_SIZE', sizeLabel: 'One size', quantity: totalQuantity }];
      sizeKind = 'sized';
    }

    if (options.lowStock && totalQuantity > (Number(row.reorder_level ?? 0) || 3)) return null;
    if (options.outOfStock && totalQuantity > 0) return null;

    const rawImages = Array.isArray(row.images) ? (row.images as string[]) : [];
    const images =
      options.view === 'list'
        ? (() => {
            const urlFirst = rawImages
              .filter((img): img is string => typeof img === 'string' && !img.startsWith('data:'))
              .slice(0, 1);
            if (urlFirst.length > 0) return urlFirst;
            const firstBase64 = rawImages.find(
              (img): img is string => typeof img === 'string' && img.startsWith('data:') && img.length <= 80_000
            );
            return firstBase64 ? [firstBase64] : [];
          })()
        : rawImages;

    return {
      id: rowId,
      warehouseId: effectiveWarehouseId,
      sku: String(row.sku ?? ''),
      barcode: row.barcode ?? null,
      name: String(row.name ?? ''),
      description: row.description ?? null,
      category: String(row.category ?? ''),
      sizeKind,
      sellingPrice: Number(row.selling_price ?? 0),
      costPrice: Number(row.cost_price ?? 0),
      reorderLevel: Number(row.reorder_level ?? 0),
      quantity: totalQuantity,
      quantityBySize: sizes,
      location: row.location ?? null,
      supplier: row.supplier ?? null,
      tags: Array.isArray(row.tags) ? row.tags : [],
      images,
      color: row.color != null ? String(row.color).trim() || null : null,
      version: Number(row.version ?? 0),
      createdAt: String(row.created_at ?? ''),
      updatedAt: String(row.updated_at ?? ''),
    };
  }).filter((p) => p !== null) as ListProduct[];

  // Only return products that have inventory in this warehouse (inv or by_size for same warehouse_id).
  const filtered = data.filter(
    (p) => invMap[p.id] !== undefined || (sizeMap[p.id]?.length ?? 0) > 0
  );

  return {
    data: filtered,
    total: count ?? filtered.length,
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
  // Phase 4: query sizes without size_codes join so we always get quantities (no drop when join fails).
  const { data: sizeData } = await db
    .from('warehouse_inventory_by_size')
    .select('size_code, quantity')
    .eq('warehouse_id', warehouseId)
    .eq('product_id', productId);
  const sizeRows = (sizeData ?? []) as Array<{ size_code: string; quantity: number }>;
  let sizes = sizeRows.map((s) => ({
    sizeCode: String(s.size_code),
    sizeLabel: String(s.size_code),
    quantity: Number(s.quantity ?? 0),
  })).sort((a, b) => a.sizeCode.localeCompare(b.sizeCode));
  const hasSizeRows = sizes.length > 0;
  quantity = hasSizeRows ? sizes.reduce((s, x) => s + x.quantity, 0) : Number((invRow as { quantity?: number } | null)?.quantity ?? 0);
  const rawSizeKind = String(r.size_kind ?? 'na');
  let sizeKind = rawSizeKind;
  // When no per-size rows but we have quantity, return a synthetic "One size" row so sizes show again in inventory and user can add more when editing.
  if (!hasSizeRows && quantity > 0) {
    sizes = [{ sizeCode: 'ONE_SIZE', sizeLabel: 'One size', quantity }];
    sizeKind = 'sized';
  }

  return {
    id: String(r.id ?? ''),
    warehouseId,
    sku: String(r.sku ?? ''),
    barcode: r.barcode != null ? String(r.barcode) : null,
    name: String(r.name ?? ''),
    description: r.description != null ? String(r.description) : null,
    category: String(r.category ?? ''),
    sizeKind,
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
    const code = (insertProductError as { code?: string }).code;
    throw new Error(normalizeDbConstraintError(insertProductError.message, 'create', code));
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
      const catalog = await getSizeCodes();
      const allowed = new Set(catalog.map((r) => String(r.size_code).toUpperCase().trim()));
      const invalid = sizeRows
        .map((r) => r.size_code)
        .filter((code) => !allowed.has(code));
      if (invalid.length > 0) {
        const unique = [...new Set(invalid)];
        throw new Error(
          `Invalid size code(s): ${unique.join(', ')}. Use a size from the catalog (e.g. US9, EU42, M, 6Y).`
        );
      }
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
  const bodySizes = Array.isArray(body.quantityBySize) ? (body.quantityBySize as Array<{ sizeCode: string; quantity: number }>) : null;
  const existingSizes = Array.isArray(existing.quantityBySize) ? existing.quantityBySize : [];
  // Use client's quantityBySize when it's an array (including [] to clear). Only preserve existing when client did not send the field (bodySizes === null).
  const quantityBySize =
    bodySizes !== null
      ? bodySizes
      : sizeKind === 'sized' && existingSizes.length > 0
        ? existingSizes.map((s) => ({ sizeCode: s.sizeCode, quantity: s.quantity }))
        : [];
  const isSized = sizeKind === 'sized' && quantityBySize.length > 0;
  const totalQty = isSized
    ? quantityBySize.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
    : Number(body.quantity ?? existing.quantity ?? 0);

  if (isSized && quantityBySize.length > 0) {
    const payloadCodes = new Set(
      quantityBySize
        .map((r) => String(r.sizeCode ?? '').trim().toUpperCase() || 'NA')
    );
    const { data: existingSizes } = await db
      .from('warehouse_inventory_by_size')
      .select('size_code')
      .eq('warehouse_id', warehouseId)
      .eq('product_id', productId);
    const toRemove = (existingSizes ?? []).filter(
      (row: { size_code: string }) => !payloadCodes.has(String(row.size_code).toUpperCase())
    );
    for (const row of toRemove) {
      await db
        .from('warehouse_inventory_by_size')
        .delete()
        .eq('warehouse_id', warehouseId)
        .eq('product_id', productId)
        .eq('size_code', row.size_code);
    }
    const sizeRows = quantityBySize
      .filter((r) => String(r.sizeCode ?? '').trim() || true)
      .map((r) => ({
        product_id: productId,
        warehouse_id: warehouseId,
        size_code: String(r.sizeCode ?? '').trim().toUpperCase() || 'NA',
        quantity: Math.max(0, Number(r.quantity) || 0),
        updated_at: now,
      }));
    if (sizeRows.length > 0) {
      const catalog = await getSizeCodes();
      const allowed = new Set(catalog.map((r) => String(r.size_code).toUpperCase().trim()));
      const invalid = sizeRows
        .map((r) => r.size_code)
        .filter((code) => code !== 'NA' && !allowed.has(code));
      if (invalid.length > 0) {
        const unique = [...new Set(invalid)];
        throw new Error(
          `Invalid size code(s): ${unique.join(', ')}. Use a size from the catalog (e.g. US9, EU42, M, 6Y).`
        );
      }
      const { error: upsertSizeError } = await db
        .from('warehouse_inventory_by_size')
        .upsert(sizeRows, { onConflict: 'warehouse_id,product_id,size_code', ignoreDuplicates: false });
      if (upsertSizeError) {
        throw new Error(`Failed to update inventory by size: ${upsertSizeError.message}`);
      }
    }
  } else {
    await db.from('warehouse_inventory_by_size').delete().eq('product_id', productId).eq('warehouse_id', warehouseId);
  }

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
