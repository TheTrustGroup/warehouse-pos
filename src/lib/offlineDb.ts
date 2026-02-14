/**
 * IndexedDB layer for offline product cache and transaction queue.
 * Use for scale and long offline periods; falls back to localStorage if IDB unavailable.
 */

const DB_NAME = 'warehouse-pos';
const DB_VERSION = 2;
const STORE_PRODUCTS = 'products';
const STORE_OFFLINE_TX = 'offline_transactions';
/** Phase 4: append-only event queue for offline sync (event_id = idempotency key). */
export const STORE_POS_EVENT_QUEUE = 'pos_event_queue';

let dbPromise: Promise<IDBDatabase> | null = null;

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
    req.onsuccess = () => resolve(req.result);
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
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
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
  } catch {
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
  } catch {
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
    if (import.meta.env.DEV) console.warn('IndexedDB remove offline tx failed:', e);
  }
}

/** Check if IndexedDB is available. */
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}
