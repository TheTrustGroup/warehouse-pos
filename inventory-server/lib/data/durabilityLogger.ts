/**
 * Durability/audit logging for mutations.
 * Persists to durability_log table; fire-and-forget so response is not delayed.
 */

import { getSupabase } from '../supabase';

export interface DurabilityLogEntry {
  status: 'success' | 'failed';
  entity_type: string;
  entity_id: string;
  warehouse_id?: string;
  request_id?: string;
  user_role?: string;
  message?: string;
}

export function logDurability(entry: DurabilityLogEntry): void {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console -- intentional dev-only audit log
    console.info('[durability]', entry);
  }

  persistLog(entry).catch((err) => {
    console.error('[durability] persist failed:', err);
  });
}

async function persistLog(entry: DurabilityLogEntry): Promise<void> {
  const supabase = getSupabase();
  await supabase.from('durability_log').insert({
    status: entry.status,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    warehouse_id: entry.warehouse_id ?? null,
    request_id: entry.request_id ?? null,
    user_role: entry.user_role ?? null,
    message: entry.message ?? null,
  });
}
