/**
 * Scope resolution (Phase 3). Determines allowed stores, warehouses, POS for a session.
 * Admin = full access. Non-admin = from user_scopes; absence = unrestricted (legacy).
 */

import type { Session } from './session';
import { isAdmin } from './roles';
import { getScopeForUser } from '@/lib/data/userScopes';

export interface ResolvedScope {
  allowedStoreIds: string[];
  allowedWarehouseIds: string[];
  allowedPosIds: string[];
  /** True if user has no scope rows (legacy: unrestricted). */
  isUnrestricted: boolean;
}

/** Resolve allowed scope for this session. Admin → full access (isUnrestricted true). */
export async function resolveUserScope(session: Session): Promise<ResolvedScope> {
  if (isAdmin(session.role)) {
    return {
      allowedStoreIds: [],
      allowedWarehouseIds: [],
      allowedPosIds: [],
      isUnrestricted: true,
    };
  }
  const scope = await getScopeForUser(session.email);
  const isUnrestricted =
    scope.allowedStoreIds.length === 0 &&
    scope.allowedWarehouseIds.length === 0 &&
    scope.allowedPosIds.length === 0;
  return {
    ...scope,
    isUnrestricted,
  };
}

/**
 * Check if a requested store_id is allowed for this scope. Returns true if allowed or unrestricted.
 */
export function isStoreAllowed(scope: ResolvedScope, storeId: string | null | undefined): boolean {
  if (!storeId) return true;
  if (scope.isUnrestricted) return true;
  return scope.allowedStoreIds.includes(storeId);
}

/**
 * Check if a requested warehouse_id is allowed. Returns true if allowed or unrestricted.
 */
export function isWarehouseAllowed(scope: ResolvedScope, warehouseId: string | null | undefined): boolean {
  if (!warehouseId) return true;
  if (scope.isUnrestricted) return true;
  return scope.allowedWarehouseIds.includes(warehouseId);
}

/**
 * Check if a requested pos_id is allowed. Returns true if allowed or unrestricted.
 */
export function isPosAllowed(scope: ResolvedScope, posId: string | null | undefined): boolean {
  if (!posId) return true;
  if (scope.isUnrestricted) return true;
  return scope.allowedPosIds.includes(posId);
}

/** Log and return false when access is denied (out of scope). */
export function logScopeDeny(context: { path: string; method: string; email: string; storeId?: string; warehouseId?: string; posId?: string }): void {
  console.warn('[SEC-SCOPE-DENY] User tried to access out-of-scope resource', context);
}
