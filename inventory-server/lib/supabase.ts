/**
 * Server Supabase access. All API routes use the same singleton to avoid connection pool exhaustion.
 * @see lib/supabase/admin.ts for the single createClient() instantiation.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

export function getSupabase(): SupabaseClient {
  return supabaseAdmin;
}

export function getServiceSupabase(): SupabaseClient {
  return supabaseAdmin;
}
