/**
 * Store entity (Phase 3). Read/write for admin; list filtered by scope for non-admin.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const TABLE = 'stores';

const getSupabase = (): SupabaseClient => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
};

export interface StoreRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

function rowToApi(row: StoreRow): Store {
  return {
    id: row.id,
    name: row.name,
    status: row.status as 'active' | 'inactive',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** GET all stores (optionally filter by allowed ids for scope). */
export async function getStores(allowedStoreIds?: string[] | null): Promise<Store[]> {
  const supabase = getSupabase();
  let query = supabase.from(TABLE).select('*').order('name');
  if (allowedStoreIds != null && allowedStoreIds.length > 0) {
    query = query.in('id', allowedStoreIds);
  }
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as StoreRow[]).map(rowToApi);
}

/** GET one store by id. */
export async function getStoreById(id: string): Promise<Store | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToApi(data as StoreRow) : null;
}
