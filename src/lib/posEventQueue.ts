/**
 * Phase 4: POS event queue for offline sync.
 * Uses shared IndexedDB (offlineDb). Append-only events; only status is updated.
 */

import { openDb, STORE_POS_EVENT_QUEUE } from './offlineDb';

export type PosEventType = 'SALE' | 'RETURN';
export type PosEventStatus = 'PENDING' | 'SYNCED' | 'FAILED';

/** API transaction body (POST /api/transactions). Stored as payload for replay. */
export type PosEventPayload = Record<string, unknown>;

export interface PosEvent {
  event_id: string;
  type: PosEventType;
  /** Full transaction body for POST /api/transactions (so sync replays as-is). */
  payload: PosEventPayload;
  warehouse_id: string;
  store_id?: string | null;
  pos_id?: string | null;
  operator_id?: string | null;
  created_at: string;
  status: PosEventStatus;
  /** Set when SYNCED: server transaction id */
  transaction_id?: string | null;
}

function serializeEvent(e: PosEvent): PosEvent {
  return { ...e };
}

/** Append event to queue (append-only). Status PENDING. */
export async function enqueuePosEvent(event: Omit<PosEvent, 'status'> & { status?: PosEventStatus }): Promise<void> {
  const record: PosEvent = {
    ...event,
    status: event.status ?? 'PENDING',
  };
  try {
    const db = await openDb();
    const store = db.transaction(STORE_POS_EVENT_QUEUE, 'readwrite').objectStore(STORE_POS_EVENT_QUEUE);
    store.put(serializeEvent(record));
  } catch (e) {
    console.warn('[posEventQueue] enqueue failed', e);
    throw e;
  }
}

/** Get all events with status PENDING, oldest first (for sync). */
export async function getPendingPosEvents(): Promise<PosEvent[]> {
  try {
    const db = await openDb();
    const store = db.transaction(STORE_POS_EVENT_QUEUE, 'readonly').objectStore(STORE_POS_EVENT_QUEUE);
    const index = store.index('by_status');
    const req = index.getAll(IDBKeyRange.only('PENDING'));
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const rows = (req.result || []) as PosEvent[];
        rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/** Update only status (and optional transaction_id). Single mutable field. */
export async function updateEventStatus(
  eventId: string,
  status: PosEventStatus,
  transactionId?: string | null
): Promise<void> {
  try {
    const db = await openDb();
    const store = db.transaction(STORE_POS_EVENT_QUEUE, 'readwrite').objectStore(STORE_POS_EVENT_QUEUE);
    const getReq = store.get(eventId);
    await new Promise<void>((resolve, reject) => {
      getReq.onsuccess = () => {
        const existing = getReq.result as PosEvent | undefined;
        if (!existing) {
          resolve();
          return;
        }
        const updated: PosEvent = {
          ...existing,
          status,
          ...(transactionId !== undefined ? { transaction_id: transactionId ?? null } : {}),
        };
        store.put(updated);
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (e) {
    console.warn('[posEventQueue] updateStatus failed', e);
  }
}

/** Count by status (for UI badge). */
export async function getPosEventCounts(): Promise<{ pending: number; failed: number }> {
  try {
    const db = await openDb();
    const store = db.transaction(STORE_POS_EVENT_QUEUE, 'readonly').objectStore(STORE_POS_EVENT_QUEUE);
    const all = await new Promise<PosEvent[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []) as PosEvent[]);
      req.onerror = () => reject(req.error);
    });
    let pending = 0;
    let failed = 0;
    for (const e of all) {
      if (e.status === 'PENDING') pending++;
      else if (e.status === 'FAILED') failed++;
    }
    return { pending, failed };
  } catch {
    return { pending: 0, failed: 0 };
  }
}

/** Remove SYNCED events older than 24h (hygiene). Optional. */
export async function pruneSyncedEvents(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<void> {
  try {
    const db = await openDb();
    const store = db.transaction(STORE_POS_EVENT_QUEUE, 'readwrite').objectStore(STORE_POS_EVENT_QUEUE);
    const index = store.index('by_status');
    const req = index.getAll(IDBKeyRange.only('SYNCED'));
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        const rows = (req.result || []) as PosEvent[];
        const cutoff = Date.now() - olderThanMs;
        for (const e of rows) {
          if (new Date(e.created_at).getTime() < cutoff) {
            store.delete(e.event_id);
          }
        }
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[posEventQueue] prune failed', e);
  }
}

export function isPosEventQueueAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}
