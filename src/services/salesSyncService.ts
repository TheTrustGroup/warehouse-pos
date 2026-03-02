/**
 * Sales sync service: when back online, POSTs pending POS sale events to /api/sales
 * with Idempotency-Key so replays are safe. Does not use circuit breaker (background sync).
 *
 * @see docs/OFFLINE_SYSTEM_APPROACH.md
 */

import { API_BASE_URL, getApiHeaders } from '../lib/api';
import {
  getPendingSaleEvents,
  deleteSaleEvent,
  markSaleEventFailed,
} from '../lib/offlineDb';

const SYNC_TIMEOUT_MS = 30_000;

function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === true;
}

/**
 * Process all pending sale events: POST each to /api/sales with Idempotency-Key.
 * On 2xx: remove event. On 409: mark failed (no retry). On 5xx/network: leave pending.
 */
export async function processSalesSyncQueue(): Promise<{
  synced: number;
  failed: number;
  pending: number;
}> {
  const result = { synced: 0, failed: 0, pending: 0 };
  if (!isOnline()) return result;

  const events = await getPendingSaleEvents();
  result.pending = events.length;
  if (events.length === 0) return result;

  for (const event of events) {
    const { event_id, payload } = event;
    const url = `${API_BASE_URL.replace(/\/$/, '')}/api/sales`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: new Headers({
          ...Object.fromEntries(new Headers(getApiHeaders()).entries()),
          'Idempotency-Key': event_id,
          'Content-Type': 'application/json',
        }),
        credentials: 'include',
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status >= 200 && res.status < 300) {
        await deleteSaleEvent(event_id);
        result.synced++;
        result.pending--;
      } else if (res.status === 409) {
        await markSaleEventFailed(event_id);
        result.failed++;
        result.pending--;
      }
      // 5xx or network: leave event pending for next run
    } catch {
      clearTimeout(timeoutId);
      // Leave event pending
    }
  }

  return result;
}
