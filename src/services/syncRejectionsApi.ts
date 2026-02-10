/**
 * Phase 4: Admin API for sync rejections (failed offline syncs). Admin only.
 */

import { API_BASE_URL } from '../lib/api';
import { apiGet, apiPatch } from '../lib/apiClient';

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

export async function fetchSyncRejections(options?: {
  voided?: boolean;
  limit?: number;
}): Promise<SyncRejection[]> {
  const params = new URLSearchParams();
  if (options?.voided !== undefined) params.set('voided', String(options.voided));
  if (options?.limit != null) params.set('limit', String(options.limit));
  const path = `/api/sync-rejections${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await apiGet<{ data: SyncRejection[] }>(API_BASE_URL, path);
  return res?.data ?? [];
}

export async function voidSyncRejection(id: string): Promise<void> {
  await apiPatch<{ ok: boolean }>(API_BASE_URL, `/api/sync-rejections/${id}/void`, {});
}
