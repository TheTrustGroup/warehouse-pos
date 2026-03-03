/**
 * Single shared Supabase client for server-side API routes.
 * Created once at module load to avoid spawning a new connection per request (pool exhaustion / statement timeout).
 * Do NOT use for user-facing auth — service role only.
 */
import { createClient } from '@supabase/supabase-js';

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

export const supabaseAdmin = createClient(url, key, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 0 } },
  db: { schema: 'public' as const },
});
