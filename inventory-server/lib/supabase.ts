import { createClient, SupabaseClient } from '@supabase/supabase-js';

/** Shared options: no Realtime subscriptions used (API-only); pin schema to avoid expensive introspection. */
const serverClientOptions = {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 0 } },
  db: { schema: 'public' as const },
} as const;

let client: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key?.trim()) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the inventory-server.');
  }
  client = createClient(url, key, serverClientOptions);
  return client;
}

export function getServiceSupabase(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  serviceClient = createClient(url, key, serverClientOptions);
  return serviceClient;
}
