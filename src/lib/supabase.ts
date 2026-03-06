/**
 * Supabase client for the frontend (Realtime only).
 * Used by useInventoryRealtime to subscribe to postgres_changes for instant cross-device updates.
 *
 * Requires env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
 * Enable Replication in Supabase Dashboard for: warehouse_inventory_by_size, sales, warehouse_products.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (client != null) return client;
  if (!url?.trim() || !anonKey?.trim()) return null;
  client = createClient(url, anonKey);
  return client;
}
