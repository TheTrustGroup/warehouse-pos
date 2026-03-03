/**
 * IndexedDB layer for offline product cache and transaction queue.
 * Use for scale and long offline periods; falls back to localStorage if IDB unavailable.
 * On QuotaExceededError we set offline_storage_quota_exceeded and dispatch event for toast (INTEGRATION_PLAN).
 */
import { isQuotaExceededError, setOfflineQuotaExceeded } from './offlineQuota';
import { isTransactionError } from '../db/inventoryDB';

const DB_NAME = 'warehouse-pos';
const DB_VERSION = 2;
const STORE_PRODUCTS = 'products';
const STORE_OFFLINE_TX = 'offline_transactions';
/** Phase 4: append-only event queue for offline sync (event_id = idempotency key). */
export const STORE_POS_EVENT_QUEUE = 'pos_event_queue';

let dbPromise: Promise<IDBDatabase> | null = null;

/** Clear cached DB promise so next openDb() reopens. Call after transaction/closed errors to avoid e.trans. */
export function clearOfflineDbInstance(): void {
  dbPromise = null;
}

/** Open shared IndexedDB (used by offlineDb and posEventQueue). */
export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (db == null) {
        reject(new Error('IndexedDB open returned no database'));
        return;
      }
      resolve(db);
    };
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
        db.createObjectStore(STORE_PRODUCTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_OFFLINE_TX)) {
        db.createObjectStore(STORE_OFFLINE_TX, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_POS_EVENT_QUEUE)) {
        const store = db.createObjectStore(STORE_POS_EVENT_QUEUE, { keyPath: 'event_id' });
        store.createIndex('by_status', 'status', { unique: false });
        store.createIndex('by_created_at', 'created_at', { unique: false });
      }
    };
  });
  return dbPromise;
}

function serializeForDb<T>(obj: T): Record<string, unknown> {
  const rec = obj as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else out[k] = v;
  }
  return out;
}

function deserializeDates<T>(obj: Record<string, unknown>, dateKeys: string[]): T {
  const out = { ...obj };
  for (const k of dateKeys) {
    if (typeof (out as any)[k] === 'string') {
      (out as any)[k] = new Date((out as any)[k] as string);
    }
  }
  return out as T;
}

/** Save products to IndexedDB (for offline cache). */
export async function saveProductsToDb(products: unknown[]): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
    const store = tx.objectStore(STORE_PRODUCTS);
    store.clear();
    for (const p of products) {
      store.put(serializeForDb(p));
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        const err = tx.error;
        if (err && isQuotaExceededError(err)) {
          setOfflineQuotaExceeded();
        }
        reject(err);
      };
    });
  } catch (e) {
    if (isTransactionError(e)) clearOfflineDbInstance();
    if (isQuotaExceededError(e)) setOfflineQuotaExceeded();
    if (import.meta.env.DEV) console.warn('IndexedDB save products failed:', e);
  }
}

/** Load products from IndexedDB. Returns [] if unavailable or empty. */
export async function loadProductsFromDb<T = unknown>(): Promise<T[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_PRODUCTS, 'readonly');
    const store = tx.objectStore(STORE_PRODUCTS);
    const req = store.getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const rows = (req.result || []).map((r: Record<string, unknown>) =>
          deserializeDates(r, ['createdAt', 'updatedAt', 'expiryDate'])
        );
        resolve(rows as T[]);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    if (isTransactionError(e)) clearOfflineDbInstance();
    return [];
  }
}

/** Append transaction to offline queue in IndexedDB. */
export async function enqueueOfflineTransaction(tx: Record<string, unknown>): Promise<void> {
  try {
    const db = await openDb();
    const store = db.transaction(STORE_OFFLINE_TX, 'readwrite').objectStore(STORE_OFFLINE_TX);
    store.put(serializeForDb(tx));
  } catch (e) {
    if (isTransactionError(e)) clearOfflineDbInstance();
    if (import.meta.env.DEV) console.warn('IndexedDB enqueue transaction failed:', e);
  }
}

/** Get all offline queued transactions. */
export async function getOfflineTransactionQueue<T = unknown>(): Promise<T[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_OFFLINE_TX, 'readonly');
    const req = tx.objectStore(STORE_OFFLINE_TX).getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const rows = (req.result || []).map((r: Record<string, unknown>) =>
          deserializeDates(r, ['createdAt', 'completedAt'])
        );
        resolve(rows as T[]);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    if (isTransactionError(e)) clearOfflineDbInstance();
    return [];
  }
}

/** Clear offline transaction queue (after successful sync). */
export async function clearOfflineTransactionQueue(): Promise<void> {
  try {
    const db = await openDb();
    const store = db.transaction(STORE_OFFLINE_TX, 'readwrite').objectStore(STORE_OFFLINE_TX);
    store.clear();
  } catch (e) {
    if (isTransactionError(e)) clearOfflineDbInstance();
    if (import.meta.env.DEV) console.warn('IndexedDB clear offline queue failed:', e);
  }
}

/** Remove a single transaction from queue by id. */
export async function removeOfflineTransactionById(id: string): Promise<void> {
  try {
    const db = await openDb();
    const store = db.transaction(STORE_OFFLINE_TX, 'readwrite').objectStore(STORE_OFFLINE_TX);
    store.delete(id);
  } catch (e) {
    if (isTransactionError(e)) clearOfflineDbInstance();
    if (import.meta.env.DEV) console.warn('IndexedDB remove offline tx failed:', e);
  }
}

// ─── POS event queue (offline sales sync) ───────────────────────────────────

export type SaleEventStatus = 'pending' | 'synced' | 'failed';

export interface PosSaleEvent {
  event_id: string;
  status: SaleEventStatus;
  created_at: number;
  payload: Record<string, unknown>;
}

/** Generate a stable event id for idempotency (Idempotency-Key). */
function generateEventId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Append a sale to the POS event queue for sync when back online.
 * @param payload - Same shape as POST /api/sales body (warehouseId, lines, total, etc.)
 * @param eventId - Optional; if not provided a new UUID is generated.
 * @returns The event_id used (for receipt or retries).
 */
export async function enqueueSaleEvent(
  payload: Record<string, unknown>,
  eventId?: string
): Promise<string> {
  const event_id = eventId ?? generateEventId();
  const event: PosSaleEvent = {
    event_id,
    status: 'pending',
    created_at: Date.now(),
    payload: { ...payload },
  };
  try {
    const db = await openDb();
    const store = db.transaction(STORE_POS_EVENT_QUEUE, 'readwrite').objectStore(STORE_POS_EVENT_QUEUE);
    store.put(serializeForDb(event));
  } catch (e) {
    if (isTransactionError(e)) clearOfflineDbInstance();
    if (isQuotaExceededError(e)) setOfflineQuotaExceeded();
    if (import.meta.env.DEV) console.warn('IndexedDB enqueue sale event failed:', e);
    throw e;
  }
  return event_id;
}

/**
 * Get all pending sale events, oldest first (for sync order).
 */
export async function getPendingSaleEvents(): Promise<PosSaleEvent[]> {
  try {
    const db = await openDb();
    const store = db.transaction(STORE_POS_EVENT_QUEUE, 'readonly').objectStore(STORE_POS_EVENT_QUEUE);
    const index = store.index('by_status');
    const req = index.getAll('pending');
    const result = await new Promise<PosSaleEvent[]>((resolve, reject) => {
      req.onsuccess = () => {
        const rows = (req.result || []) as PosSaleEvent[];
        rows.sort((a, b) => a.created_at - b.created_at);
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
    return result;
  } catch (e) {
    if (isTransactionError(e)) clearOfflineDbInstance();
    return [];
  }
}

/**
 * Remove a sale event after successful sync (or after marking failed).
 */
export async function deleteSaleEvent(eventId: string): Promise<void> {
  try {
    const db = await openDb();
    const store = db.transaction(STORE_POS_EVENT_QUEUE, 'readwrite').objectStore(STORE_POS_EVENT_QUEUE);
    store.delete(eventId);
  } catch (e) {
    if (isTransactionError(e)) clearOfflineDbInstance();
    if (import.meta.env.DEV) console.warn('IndexedDB delete sale event failed:', e);
  }
}

/**
 * Mark a sale event as failed (e.g. 409 insufficient stock). Sync will not retry it.
 */
export async function markSaleEventFailed(eventId: string): Promise<void> {
  try {
    const db = await openDb();
    const store = db.transaction(STORE_POS_EVENT_QUEUE, 'readwrite').objectStore(STORE_POS_EVENT_QUEUE);
    const getReq = store.get(eventId);
    await new Promise<void>((resolve, reject) => {
      getReq.onsuccess = () => {
        const event = getReq.result as PosSaleEvent | undefined;
        if (event) {
          event.status = 'failed';
          store.put(event);
        }
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (e) {
    if (isTransactionError(e)) clearOfflineDbInstance();
    if (import.meta.env.DEV) console.warn('IndexedDB mark sale event failed:', e);
  }
}

/**
 * Count pending sale events (for UI: "Pending sales: N").
 */
export async function getPendingSaleEventsCount(): Promise<number> {
  const events = await getPendingSaleEvents();
  return events.length;
}

/** Check if IndexedDB is available. */
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}
