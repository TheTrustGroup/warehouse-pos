/**
 * Phase 4: Sync pending POS events to server. Oldest first; idempotency by event_id.
 * Marks SYNCED only on 2xx; marks FAILED on 409 (conflict); leaves PENDING on network error.
 */

import { getPendingPosEvents, updateEventStatus, type PosEvent } from './posEventQueue';
import { API_BASE_URL } from './api';
import { apiPost } from './apiClient';

export interface SyncResult {
  synced: number;
  failed: number;
  pending: number;
  error?: string;
}

/**
 * Send all PENDING events oldest-first. Idempotency-Key = event_id.
 * No double deduction: server returns existing tx on duplicate key.
 */
export async function syncPendingPosEvents(options?: {
  baseUrl?: string;
  onProgress?: (event: PosEvent, result: 'synced' | 'failed') => void;
}): Promise<SyncResult> {
  const baseUrl = options?.baseUrl ?? API_BASE_URL;
  const pending = await getPendingPosEvents();
  let synced = 0;
  let failed = 0;

  for (const event of pending) {
    if (event.type !== 'SALE') continue; // RETURN later
    const body = event.payload as Record<string, unknown>;
    try {
      const res = await apiPost<{ id: string } & Record<string, unknown>>(
        baseUrl,
        '/api/transactions',
        body,
        { idempotencyKey: event.event_id }
      );
      const txId = res?.id ?? (res as Record<string, unknown>)?.id as string | undefined;
      await updateEventStatus(event.event_id, 'SYNCED', txId ?? null);
      synced++;
      options?.onProgress?.(event, 'synced');
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      const code = (err as { code?: string })?.code;
      if (status === 409 || code === 'INSUFFICIENT_STOCK' || code === 'VOIDED') {
        await updateEventStatus(event.event_id, 'FAILED');
        failed++;
        options?.onProgress?.(event, 'failed');
      }
      // Network/5xx: leave PENDING, do not mark FAILED; will retry later
    }
  }

  const stillPending = (await getPendingPosEvents()).length;
  return { synced, failed, pending: stillPending };
}
