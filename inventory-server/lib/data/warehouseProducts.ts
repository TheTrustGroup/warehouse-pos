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

// ── Stubs for admin/API routes (mutations not yet implemented against v_products_inventory) ──

export async function createWarehouseProduct(_body: Record<string, unknown>): Promise<Record<string, unknown>> {
  throw new Error('createWarehouseProduct not implemented');
}

export async function updateWarehouseProduct(
  _id: string,
  _body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  throw new Error('updateWarehouseProduct not implemented');
}

export async function deleteWarehouseProduct(_id: string): Promise<void> {
  throw new Error('deleteWarehouseProduct not implemented');
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
