/**
 * Single shared Supabase client for server-side API routes.
 * Lazy-init so build (page data collection) does not require env at import time.
 * Do NOT use for user-facing auth — service role only.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required for inventory-server.'
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 0 } },
    db: { schema: 'public' as const },
  });
  return _client;
}
