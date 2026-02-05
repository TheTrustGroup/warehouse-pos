/**
 * Warehouse products API — single source of truth in this repo.
 * Table: warehouse_products (Supabase). Used by GET/POST/PUT/DELETE /api/products and /admin/api/products.
 * Run the migration in supabase/migrations or create the table manually (see INVENTORY_TABLE_SCHEMA.sql).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

/** Shape stored in DB (snake_case). Matches warehouse UI Product type when normalized. */
export interface WarehouseProductRow {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  quantity: number;
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
}

function rowToApi(row: WarehouseProductRow): Record<string, unknown> {
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode ?? '',
    name: row.name,
    description: row.description ?? '',
    category: row.category ?? '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    quantity: Number(row.quantity) ?? 0,
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
  };
}

function bodyToRow(body: Record<string, unknown>, id: string, ts: string): Record<string, unknown> {
  const loc = body.location && typeof body.location === 'object' && !Array.isArray(body.location) ? body.location as Record<string, string> : {};
  const sup = body.supplier && typeof body.supplier === 'object' && !Array.isArray(body.supplier) ? body.supplier as Record<string, string> : {};
  return {
    id,
    sku: String(body.sku ?? '').trim() || id,
    barcode: String(body.barcode ?? ''),
    name: String(body.name ?? '').trim(),
    description: body.description != null ? String(body.description) : '',
    category: String(body.category ?? ''),
    tags: Array.isArray(body.tags) ? body.tags : [],
    quantity: Number(body.quantity) || 0,
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
  };
}

/** GET all warehouse products (no cache). */
export async function getWarehouseProducts(): Promise<Record<string, unknown>[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from(TABLE).select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as WarehouseProductRow[]).map(rowToApi);
}

/** GET one by id. */
export async function getWarehouseProductById(id: string): Promise<Record<string, unknown> | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToApi(data as WarehouseProductRow) : null;
}

/** POST: create one. Returns canonical row. Uses id from body or generates UUID. */
export async function createWarehouseProduct(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const supabase = getSupabase();
  const id: string = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : crypto.randomUUID();
  const ts = now();
  const row = bodyToRow(body, id, ts);
  const { data, error } = await supabase.from(TABLE).insert(row).select().single();
  if (error) throw error;
  return rowToApi(data as WarehouseProductRow);
}

/** PUT: update one. Version check optional (backend can enforce optimistic lock). */
export async function updateWarehouseProduct(id: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const supabase = getSupabase();
  const ts = now();
  const existing = await getWarehouseProductById(id);
  if (!existing) {
    const err = new Error('Product not found') as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  const version = Number(body.version ?? existing.version ?? 0);
  const row = bodyToRow({ ...existing, ...body, id, updatedAt: ts, version }, id, ts);
  const { data, error } = await supabase.from(TABLE).update(row).eq('id', id).select().single();
  if (error) throw error;
  return rowToApi(data as WarehouseProductRow);
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
