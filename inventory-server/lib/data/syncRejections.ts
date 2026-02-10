/**
 * Phase 4: Sync rejections — record and query failed offline sync attempts.
 * Used when server cannot apply an event (e.g. INSUFFICIENT_STOCK). Admin can void.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const TABLE = 'sync_rejections';

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface SyncRejectionRow {
  id: string;
  idempotency_key: string;
  pos_id: string | null;
  store_id: string | null;
  warehouse_id: string | null;
  reason: string;
  voided_at: string | null;
  created_at: string;
}

export interface SyncRejection {
  id: string;
  idempotencyKey: string;
  posId: string | null;
  storeId: string | null;
  warehouseId: string | null;
  reason: string;
  voidedAt: string | null;
  createdAt: string;
}

function rowToApi(row: SyncRejectionRow): SyncRejection {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    posId: row.pos_id ?? null,
    storeId: row.store_id ?? null,
    warehouseId: row.warehouse_id ?? null,
    reason: row.reason,
    voidedAt: row.voided_at ?? null,
    createdAt: row.created_at,
  };
}

/** Record a rejected sync (e.g. INSUFFICIENT_STOCK). Does not overwrite existing row (preserves voided_at). */
export async function recordRejection(params: {
  idempotencyKey: string;
  posId?: string | null;
  storeId?: string | null;
  warehouseId?: string | null;
  reason: string;
}): Promise<void> {
  const existing = await getRejectionByKey(params.idempotencyKey);
  if (existing) return;
  const supabase = getSupabase();
  const { error } = await supabase.from(TABLE).insert({
    idempotency_key: params.idempotencyKey,
    pos_id: params.posId?.trim() || null,
    store_id: params.storeId?.trim() || null,
    warehouse_id: params.warehouseId?.trim() || null,
    reason: params.reason.trim(),
  });
  if (error) throw error;
}

/** Get rejection by idempotency key, if any. */
export async function getRejectionByKey(idempotencyKey: string): Promise<SyncRejection | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToApi(data as SyncRejectionRow) : null;
}

/** List rejections (optional: only non-voided). Newest first. */
export async function listRejections(options?: { voidedOnly?: boolean; limit?: number }): Promise<SyncRejection[]> {
  const supabase = getSupabase();
  let query = supabase.from(TABLE).select('*').order('created_at', { ascending: false });
  if (options?.voidedOnly === true) {
    query = query.not('voided_at', 'is', null);
  } else if (options?.voidedOnly === false) {
    query = query.is('voided_at', null);
  }
  const limit = Math.min(Math.max(1, options?.limit ?? 100), 500);
  query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as SyncRejectionRow[]).map(rowToApi);
}

/** Mark a rejection as voided (admin chose not to fulfill). */
export async function voidRejection(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from(TABLE)
    .update({ voided_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
