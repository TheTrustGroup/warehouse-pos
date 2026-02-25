export interface UserScope {
  allowedWarehouseIds: string[];
  allowedStoreIds: string[];
  allowedPosIds: string[];
}

/**
 * Resolve allowed warehouse IDs for a user. Admin with no env: all warehouses (empty array = no filter).
 * Set ALLOWED_WAREHOUSE_IDS in env (comma-separated) to restrict; or implement DB lookup.
 */
export async function getScopeForUser(_email: string): Promise<UserScope> {
  const raw = process.env.ALLOWED_WAREHOUSE_IDS?.trim();
  if (!raw) return EMPTY_SCOPE;
  const allowedWarehouseIds = raw.split(',').map((id) => id.trim()).filter(Boolean);
  return { ...EMPTY_SCOPE, allowedWarehouseIds };
}

const EMPTY_SCOPE: UserScope = { allowedWarehouseIds: [], allowedStoreIds: [], allowedPosIds: [] };

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
