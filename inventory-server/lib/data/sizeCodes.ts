/**
 * Size codes reference: system identifier (size_code) and human-readable label.
 * Used for sneakers, clothing, kidswear; non-sized products use NA or OS.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const TABLE = 'size_codes';

const getSupabase = (): SupabaseClient => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
};

export interface SizeCodeRow {
  size_code: string;
  size_label: string;
  size_order: number;
}

/** Get all size codes ordered by size_order. */
export async function getSizeCodes(): Promise<SizeCodeRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select('size_code, size_label, size_order')
    .order('size_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SizeCodeRow[];
}

/** Get one size code by code. Returns null if not found. */
export async function getSizeCode(sizeCode: string): Promise<SizeCodeRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select('size_code, size_label, size_order')
    .eq('size_code', sizeCode)
    .maybeSingle();
  if (error) throw error;
  return data as SizeCodeRow | null;
}

/** Normalize size code for storage: uppercase, no spaces. */
export function normalizeSizeCode(input: string): string {
  return String(input ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase() || 'NA';
}
