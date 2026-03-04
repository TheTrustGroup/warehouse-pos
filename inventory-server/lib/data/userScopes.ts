import { getSupabase } from '@/lib/supabase';

export interface UserScope {
  allowedWarehouseIds: string[];
  allowedStoreIds: string[];
  allowedPosIds: string[];
}

const EMPTY_SCOPE: UserScope = { allowedWarehouseIds: [], allowedStoreIds: [], allowedPosIds: [] };

/** In-memory cache for scope by email (TTL 30s) so product-list and other routes avoid repeated Supabase round-trips. */
const SCOPE_CACHE_TTL_MS = 30_000;
const scopeCache = new Map<string, { scope: UserScope; ts: number }>();

function getScopeFromCache(email: string): UserScope | null {
  const entry = scopeCache.get(email);
  if (!entry || Date.now() - entry.ts > SCOPE_CACHE_TTL_MS) return null;
  return entry.scope;
}

function setScopeCache(email: string, scope: UserScope): void {
  scopeCache.set(email, { scope, ts: Date.now() });
  if (scopeCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of scopeCache.entries()) {
      if (now - v.ts > SCOPE_CACHE_TTL_MS) scopeCache.delete(k);
    }
  }
}

/**
 * Resolve allowed warehouse IDs for a user. Reads user_scopes table when present; else env ALLOWED_WAREHOUSE_IDS.
 * When user has exactly one warehouse in user_scopes, that single ID is returned (used to bind cashier to POS location).
 * Results are cached per email for 30s to keep product fetch fast (Vercel serverless + Supabase).
 *
 * IMPORTANT: Uses getSupabase() which is the service-role client (supabaseAdmin). Service role bypasses RLS.
 */
export async function getScopeForUser(email: string): Promise<UserScope> {
  const trimmed = email?.trim().toLowerCase();
  if (!trimmed) return EMPTY_SCOPE;

  const cached = getScopeFromCache(trimmed);
  if (cached) return cached;

  try {
    const db = getSupabase();
    const { data: rows, error } = await db
      .from('user_scopes')
      .select('warehouse_id, store_id')
      .eq('user_email', trimmed)
      .not('warehouse_id', 'is', null);

    if (!error && Array.isArray(rows) && rows.length > 0) {
      const warehouseIds = [...new Set((rows as { warehouse_id: string }[]).map((r) => String(r.warehouse_id)).filter(Boolean))];
      const storeIds = [...new Set((rows as { store_id?: string }[]).map((r) => r.store_id).filter(Boolean))] as string[];
      const scope = { allowedWarehouseIds: warehouseIds, allowedStoreIds: storeIds, allowedPosIds: [] };
      setScopeCache(trimmed, scope);
      return scope;
    }
  } catch {
    /* table missing or query failed; fallback to env */
  }

  const raw = process.env.ALLOWED_WAREHOUSE_IDS?.trim();
  if (!raw) return EMPTY_SCOPE;
  const allowedWarehouseIds = raw.split(',').map((id) => id.trim()).filter(Boolean);
  const scope = { ...EMPTY_SCOPE, allowedWarehouseIds };
  setScopeCache(trimmed, scope);
  return scope;
}

/**
 * When the user has exactly one warehouse in user_scopes, return it (for binding cashier to POS; skip "Select location").
 */
export async function getSingleWarehouseIdForUser(email: string): Promise<string | undefined> {
  const scope = await getScopeForUser(email);
  if (scope.allowedWarehouseIds.length !== 1) return undefined;
  return scope.allowedWarehouseIds[0];
}

/** Stub: POS assignment for user. Implement when needed. */
export async function getAssignedPosForUser(_email: string): Promise<{ posId?: string }> {
  return {};
}

/** Stub: list scopes. Implement when needed. */
export async function listScopesForEmail(_email: string): Promise<UserScope> {
  return EMPTY_SCOPE;
}

/** Stub: set scopes. Implement when needed. */
export async function setScopesForUser(_email: string, _scopes: UserScope | Array<{ storeId: string; warehouseId: string }>): Promise<void> {
  // no-op
}
