/**
 * Size codes reference: system identifier (size_code) and human-readable label.
 * Used for sneakers, clothing, kidswear; non-sized products use NA or OS.
 */

import { getSupabase } from '@/lib/supabase';

const TABLE = 'size_codes';

export interface SizeCodeRow {
  size_code: string;
  size_label: string;
  size_order?: number;
}

function isMissingColumnError(err: { message?: string }): boolean {
  const m = (err?.message ?? '').toLowerCase();
  return m.includes('column') && (m.includes('does not exist') || m.includes('undefined'));
}

/** Get all size codes ordered by size_order (or size_code if size_order missing). Returns [] on DB/env error so callers never see 500. */
export async function getSizeCodes(): Promise<SizeCodeRow[]> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from(TABLE)
      .select('size_code, size_label, size_order')
      .order('size_order', { ascending: true });
    if (error) {
      if (isMissingColumnError(error)) {
        const fallback = await supabase
          .from(TABLE)
          .select('size_code, size_label')
          .order('size_code', { ascending: true });
        if (fallback.error) {
          console.error('[getSizeCodes]', fallback.error.message);
          return [];
        }
        return ((fallback.data ?? []) as SizeCodeRow[]).map((r) => ({ ...r, size_order: 0 }));
      }
      console.error('[getSizeCodes]', error.message);
      return [];
    }
    return (data ?? []) as SizeCodeRow[];
  } catch (e) {
    const err = e as { message?: string };
    if (isMissingColumnError(err)) {
      try {
        const supabase = getSupabase();
        const fallback = await supabase
          .from(TABLE)
          .select('size_code, size_label')
          .order('size_code', { ascending: true });
        if (!fallback.error) {
          return ((fallback.data ?? []) as SizeCodeRow[]).map((r) => ({ ...r, size_order: 0 }));
        }
      } catch {
        // ignore
      }
    }
    console.error('[getSizeCodes]', err?.message ?? e);
    return [];
  }
}

/** Get one size code by code. Returns null if not found. */
export async function getSizeCode(sizeCode: string): Promise<SizeCodeRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select('size_code, size_label, size_order')
    .eq('size_code', sizeCode)
    .maybeSingle();
  if (error) {
    if (isMissingColumnError(error)) {
      const fallback = await supabase
        .from(TABLE)
        .select('size_code, size_label')
        .eq('size_code', sizeCode)
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      const row = fallback.data as SizeCodeRow | null;
      return row ? { ...row, size_order: 0 } : null;
    }
    throw error;
  }
  return data as SizeCodeRow | null;
}

/** Normalize size code for storage: uppercase, no spaces. */
export function normalizeSizeCode(input: string): string {
  return String(input ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase() || 'NA';
}
