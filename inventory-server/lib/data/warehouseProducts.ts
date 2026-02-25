/**
 * Warehouse products list and create. List response includes images for POS/Inventory.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface ListOptions {
  limit?: number;
  offset?: number;
  q?: string;
  category?: string;
  lowStock?: boolean;
  outOfStock?: boolean;
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
  [key: string]: unknown;
}

function getDb(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** List products for a warehouse. Select includes images so POS/Inventory show product photos. */
export async function getWarehouseProducts(
  warehouseId: string | undefined,
  options: ListOptions = {}
): Promise<ListResult> {
  const db = getDb();
  const limit = Math.min(Math.max(options.limit ?? 500, 1), 2000);
  const offset = Math.max(options.offset ?? 0, 0);

  let query = db
    .from('warehouse_products')
    .select(
      'id, warehouse_id, sku, barcode, name, description, category, size_kind, selling_price, cost_price, reorder_level, location, supplier, tags, images, version, created_at, updated_at, warehouse_inventory!left(quantity)',
      { count: 'exact' }
    )
    .order('name')
    .range(offset, offset + limit - 1);

  if (warehouseId) {
    query = query.eq('warehouse_id', warehouseId);
  }
  if (options.q?.trim()) {
    const q = options.q.trim();
    query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%`);
  }
  if (options.category?.trim()) {
    query = query.eq('category', options.category.trim());
  }

  const { data: rows, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list products: ${error.message}`);
  }

  const list = (rows ?? []) as Array<Record<string, unknown> & { warehouse_inventory?: Array<{ quantity?: number }> | { quantity?: number } }>;
  const productIds = list.map((r) => r.id as string);
  const sizeMap: Record<string, Array<{ sizeCode: string; sizeLabel?: string; quantity: number }>> = {};

  if (warehouseId && productIds.length > 0) {
    const { data: sizeRows } = await db
      .from('warehouse_inventory_by_size')
      .select('product_id, size_code, quantity, size_codes!left(size_label)')
      .eq('warehouse_id', warehouseId)
      .in('product_id', productIds);
    const sizeList = (sizeRows ?? []) as Array<{
      product_id: string;
      size_code: string;
      quantity: number;
      size_codes?: { size_label?: string } | null;
    }>;
    for (const r of sizeList) {
      if (!sizeMap[r.product_id]) sizeMap[r.product_id] = [];
      sizeMap[r.product_id].push({
        sizeCode: String(r.size_code),
        sizeLabel: r.size_codes?.size_label ?? r.size_code,
        quantity: Number(r.quantity ?? 0),
      });
    }
  }

  const data = list.map((row) => {
    const inv = Array.isArray(row.warehouse_inventory)
      ? (row.warehouse_inventory as Array<{ quantity?: number }>)[0]
      : (row.warehouse_inventory as { quantity?: number } | undefined);
    const sizes = (sizeMap[row.id as string] ?? []).sort((a, b) =>
      a.sizeCode.localeCompare(b.sizeCode)
    );
    const isSized = (row.size_kind as string) === 'sized' && sizes.length > 0;
    const quantity = isSized
      ? sizes.reduce((s, r) => s + r.quantity, 0)
      : Number(inv?.quantity ?? 0);

    if (options.lowStock && quantity > (Number(row.reorder_level ?? 0) || 3)) return null;
    if (options.outOfStock && quantity > 0) return null;

    return {
      id: String(row.id ?? ''),
      warehouseId: String(row.warehouse_id ?? ''),
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
      version: Number(row.version ?? 0),
      createdAt: String(row.created_at ?? ''),
      updatedAt: String(row.updated_at ?? ''),
    };
  }).filter((p) => p !== null) as ListProduct[];

  return { data, total: count ?? data.length };
}

/** Get one product by id and warehouse (for GET ?id=). Includes images. */
export async function getProductById(
  warehouseId: string,
  productId: string
): Promise<ListProduct | null> {
  const db = getDb();
  const { data: row } = await db
    .from('warehouse_products')
    .select(
      'id, warehouse_id, sku, barcode, name, description, category, size_kind, selling_price, cost_price, reorder_level, location, supplier, tags, images, version, created_at, updated_at, warehouse_inventory!left(quantity)'
    )
    .eq('id', productId)
    .eq('warehouse_id', warehouseId)
    .single();

  if (!row) return null;

  const r = row as Record<string, unknown> & { warehouse_inventory?: Array<{ quantity?: number }> | { quantity?: number } };
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
  const inv = Array.isArray(r.warehouse_inventory)
    ? (r.warehouse_inventory as Array<{ quantity?: number }>)[0]
    : (r.warehouse_inventory as { quantity?: number } | undefined);
  const isSized = (r.size_kind as string) === 'sized' && sizes.length > 0;
  const quantity = isSized ? sizes.reduce((s, x) => s + x.quantity, 0) : Number(inv?.quantity ?? 0);

  return {
    id: String(r.id ?? ''),
    warehouseId: String(r.warehouse_id ?? ''),
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
    version: Number(r.version ?? 0),
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

/** Create product. Stub: delegate to DB or throw until full implementation. */
export async function createWarehouseProduct(_body: Record<string, unknown>): Promise<Record<string, unknown>> {
  throw new Error('createWarehouseProduct not implemented in this module; use POST /api/products with full backend');
}

/** Stub: bulk delete. Implement when needed. */
export async function deleteWarehouseProductsBulk(_ids: string[]): Promise<{ deleted: number }> {
  return { deleted: 0 };
}
