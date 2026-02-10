/**
 * User scopes API (admin): assign store & warehouse to a user by email.
 * GET /api/user-scopes?email=... — list scope for user
 * PUT /api/user-scopes — set scope for user
 */

import { API_BASE_URL } from '../lib/api';
import { apiGet, apiPut } from '../lib/apiClient';

export interface UserScopeWithNames {
  storeId: string;
  storeName: string;
  warehouseId: string;
  warehouseName: string;
}

export interface UserScopesResponse {
  scopes: UserScopeWithNames[];
}

export async function getUserScopes(email: string): Promise<UserScopeWithNames[]> {
  const normalized = email?.trim()?.toLowerCase() ?? '';
  if (!normalized) return [];
  const res = await apiGet<UserScopesResponse>(
    API_BASE_URL,
    `/api/user-scopes?email=${encodeURIComponent(normalized)}`
  );
  return Array.isArray(res?.scopes) ? res.scopes : [];
}

export async function setUserScopes(
  email: string,
  scopes: Array<{ storeId: string; warehouseId: string }>
): Promise<void> {
  const normalized = email?.trim()?.toLowerCase() ?? '';
  await apiPut(API_BASE_URL, '/api/user-scopes', {
    email: normalized,
    scopes: scopes.map((s) => ({ storeId: s.storeId.trim(), warehouseId: s.warehouseId.trim() })),
  });
}
