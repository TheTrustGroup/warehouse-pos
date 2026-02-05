/**
 * INVENTORY — SINGLE SOURCE OF TRUTH (inventory-server app only)
 * Server only. Direct DB reads. No caching. No fallback.
 * Uses real Supabase schema: Category, Product, ProductVariant.
 *
 * AUTHORITATIVE DATA STORE (this app):
 * - What database? Supabase (SUPABASE_URL). Tables: Product, ProductVariant, Category.
 * - Same in all environments? Only if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set per env. We throw if missing (no default).
 * - Warehouse vs storefront? This inventory-server is a SEPARATE app from the warehouse React UI. The warehouse UI calls
 *   API_BASE_URL (extremedeptkidz.com) for /api/products — that backend may or may not be this app. For single source of truth,
 *   warehouse and storefront must hit the SAME backend and same DB. If this app serves them, use same env (same DB) everywhere.
 * - Credentials identical? SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set; no fallback.
 * - Table differs by env? We use fixed table names (Product, ProductVariant). Fail if env vars missing.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const getSupabase = (): SupabaseClient => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required. Do not run with fallback defaults.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
};

export interface Category {
  id: string;
  name: string;
  slug: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  categoryId: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ProductVariant {
  id: string;
  productId: string;
  size: string | null;
  sku: string | null;
  price: number;
  stock: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

const now = () => new Date().toISOString();

/** Get all products (direct DB, no cache). */
export async function getProducts(): Promise<Product[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('Product')
    .select('*')
    .order('updatedAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Product[];
}

/** Get all variants, optionally filtered by product IDs. */
export async function getProductVariants(productIds?: string[]): Promise<ProductVariant[]> {
  const supabase = getSupabase();
  let q = supabase.from('ProductVariant').select('*').order('updatedAt', { ascending: false });
  if (productIds?.length) q = q.in('productId', productIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ProductVariant[];
}

/** Get categories (for add-product form). */
export async function getCategories(): Promise<Category[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('Category').select('id, name, slug').order('name');
  if (error) throw error;
  return (data ?? []) as Category[];
}

/** Add a product. Requires categoryId to exist (e.g. cat_default). */
export async function addProduct(data: {
  name: string;
  slug: string;
  description?: string | null;
  price: number;
  categoryId: string;
}): Promise<Product> {
  const supabase = getSupabase();
  const ts = now();
  const { data: row, error } = await supabase
    .from('Product')
    .insert({
      id: crypto.randomUUID(),
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      price: Number(data.price),
      categoryId: data.categoryId,
      createdAt: ts,
      updatedAt: ts,
    })
    .select()
    .single();
  if (error) throw error;
  return row as Product;
}

/** Add a variant (SKU, size, stock) for a product. */
export async function addProductVariant(data: {
  productId: string;
  size?: string | null;
  sku?: string | null;
  price: number;
  stock: number;
}): Promise<ProductVariant> {
  const supabase = getSupabase();
  const ts = now();
  const { data: row, error } = await supabase
    .from('ProductVariant')
    .insert({
      id: crypto.randomUUID(),
      productId: data.productId,
      size: data.size ?? null,
      sku: data.sku ?? null,
      price: Number(data.price),
      stock: Number(data.stock),
      createdAt: ts,
      updatedAt: ts,
    })
    .select()
    .single();
  if (error) throw error;
  return row as ProductVariant;
}

/** Update variant stock (by variant id). Full page refresh on write. */
export async function updateVariantStock(variantId: string, stock: number): Promise<ProductVariant> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('ProductVariant')
    .update({ stock: Number(stock), updatedAt: now() })
    .eq('id', variantId)
    .select()
    .single();
  if (error) throw error;
  return data as ProductVariant;
}
