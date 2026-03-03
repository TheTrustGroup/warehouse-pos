/**
 * Dexie-based IndexedDB for offline-first product inventory and sync queue.
 * All product mutations (add/update/delete) write to the local table and enqueue an
 * operation in syncQueue; SyncService processes the queue when online.
 * On QuotaExceededError we set offline_storage_quota_exceeded and dispatch for toast (INTEGRATION_PLAN).
 *
 * @module db/inventoryDB
 * @see docs/OFFLINE_ARCHITECTURE.md
 * @example
 * import { addProduct, getAllProducts, getFailedQueueItems } from './db/inventoryDB';
 * const id = await addProduct({ name: 'Widget', sku: 'W-1', category: 'Toys', price: 10, quantity: 5 });
 * const products = await getAllProducts();
 */

import Dexie from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import { setOfflineQuotaExceeded, isQuotaExceededError } from '../lib/offlineQuota';

// ---------------------------------------------------------------------------
// Types (JSDoc)
// ---------------------------------------------------------------------------

/**
 * @typedef {'synced' | 'pending' | 'error'} ProductSyncStatus
 */

/**
 * @typedef {Object} ProductRecord
 * @property {string} id - UUID primary key (client-generated)
 * @property {string} name
 * @property {string} sku
 * @property {string} category
 * @property {number} price
 * @property {number} quantity
 * @property {string} [description]
 * @property {string[]} [images]
 * @property {string} createdAt - ISO date string
 * @property {string} updatedAt - ISO date string
 * @property {ProductSyncStatus} syncStatus
 * @property {string|null} serverId - Set when synced to server
 * @property {number} lastModified - Unix timestamp (ms)
 */

/**
 * @typedef {'CREATE' | 'UPDATE' | 'DELETE'} SyncOperation
 */

/**
 * @typedef {'products'} SyncTableName
 */

/**
 * @typedef {'pending' | 'syncing' | 'failed'} SyncQueueStatus
 */

/**
 * @typedef {Object} SyncQueueItem
 * @property {number} id - Auto-increment primary key
 * @property {SyncOperation} operation
 * @property {SyncTableName} tableName
 * @property {Object} data - Full record for the operation
 * @property {number} timestamp - Unix ms
 * @property {number} attempts - Retry counter
 * @property {string} [error] - Last error message if any
 * @property {SyncQueueStatus} status
 */

/**
 * @typedef {Object} MetadataRecord
 * @property {string} key - Primary key
 * @property {*} value - Arbitrary value (JSON-serializable)
 * @property {number} updatedAt - Unix ms
 */

/**
 * @typedef {Partial<Omit<ProductRecord, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'serverId' | 'lastModified'>>} ProductInsertData
 */

/**
 * @typedef {Partial<Omit<ProductRecord, 'id'>>} ProductUpdateData
 */

// ---------------------------------------------------------------------------
// Database class
// ---------------------------------------------------------------------------

class ExtremeDeptKidzDexie extends Dexie {
  constructor() {
    super('ExtremeDeptKidzDB');
    this.version(1).stores({
      products: 'id, sku, syncStatus, updatedAt, lastModified',
      syncQueue: '++id, status, timestamp, attempts',
      metadata: 'key',
    });
    // Version 2: migration hook for future schema changes. Add version(3).stores(...).upgrade(tx => ...) when needed.
    this.version(2).stores({
      products: 'id, sku, syncStatus, updatedAt, lastModified',
      syncQueue: '++id, status, timestamp, attempts',
      metadata: 'key',
    }).upgrade((tx) => {
      // No schema change; run any one-time data migrations here if needed in future.
    });
    this.products = this.table('products');
    this.syncQueue = this.table('syncQueue');
    this.metadata = this.table('metadata');
  }
}

let dbInstance = null;
let dbInitPromise = null;

/**
 * Lazy-init Dexie. Returns Promise<ExtremeDeptKidzDexie | null>. Resolves to null if IndexedDB
 * is unavailable or open fails (e.g. private mode, quota). Prevents "null is not an object (evaluating 'e.trans'|'n.type')"
 * from idb/Dexie when transaction is null.
 * @returns {Promise<ExtremeDeptKidzDexie | null>}
 */
export function getDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbInitPromise) return dbInitPromise;
  dbInitPromise = (async () => {
    try {
      if (typeof indexedDB === 'undefined') return null;
      const instance = new ExtremeDeptKidzDexie();
      await instance.open();
      dbInstance = instance;
      return instance;
    } catch (e) {
      if (isQuotaExceededError(e)) setOfflineQuotaExceeded();
      if (import.meta.env.DEV) console.warn('[inventoryDB] Dexie init failed:', e);
      return null;
    }
  })();
  return dbInitPromise;
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @returns {string} ISO date string
 */
function nowISO() {
  return new Date().toISOString();
}

/**
 * @returns {number} Unix timestamp in ms
 */
function nowTs() {
  return Date.now();
}

// ---------------------------------------------------------------------------
// Product query API
// ---------------------------------------------------------------------------

/**
 * Get all products from local DB.
 * @returns {Promise<ProductRecord[]>}
 */
export async function getAllProducts() {
  const d = await getDB();
  return d ? d.products.toArray() : [];
}

/**
 * Get a single product by id.
 * @param {string} id - Product UUID
 * @returns {Promise<ProductRecord|undefined>}
 */
export async function getProductById(id) {
  const d = await getDB();
  return d ? d.products.get(id) : undefined;
}

/**
 * Add a new product locally and enqueue a CREATE for sync. Id is generated with uuid v4;
 * serverId remains null until sync succeeds. Edge case: always use this (or equivalent)
 * for creates so the sync queue stays in sync with the products table.
 *
 * @param {ProductInsertData} data - Product fields (id will be generated)
 * @returns {Promise<string>} The generated product id (UUID)
 */
export async function addProduct(data) {
  const d = await getDB();
  if (!d) throw new Error('IndexedDB unavailable');
  const id = uuidv4();
  const now = nowISO();
  const ts = nowTs();
  const record = {
    id,
    name: data.name ?? '',
    sku: data.sku ?? '',
    category: data.category ?? '',
    price: data.price ?? 0,
    quantity: data.quantity ?? 0,
    description: data.description ?? '',
    images: Array.isArray(data.images) ? data.images : [],
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
    serverId: null,
    lastModified: ts,
  };
  try {
    await d.products.add(record);
    await d.syncQueue.add({
      operation: 'CREATE',
      tableName: 'products',
      data: record,
      timestamp: ts,
      attempts: 0,
      status: 'pending',
    });
  } catch (e) {
    if (isQuotaExceededError(e)) setOfflineQuotaExceeded();
    throw e;
  }
  return id;
}

/**
 * Update a product locally and enqueue an UPDATE for sync. If the product was previously
 * synced, syncStatus is set to 'pending'; otherwise left unchanged (e.g. already 'pending').
 *
 * @param {string} id - Product UUID (local id)
 * @param {ProductUpdateData} data - Fields to update (merged with existing)
 * @returns {Promise<void>}
 * @throws {Error} If product not found
 */
export async function updateProduct(id, data) {
  const d = await getDB();
  if (!d) throw new Error('IndexedDB unavailable');
  const existing = await d.products.get(id);
  if (!existing) {
    throw new Error(`Product not found: ${id}`);
  }
  const now = nowISO();
  const ts = nowTs();
  const updated = {
    ...existing,
    ...data,
    id,
    updatedAt: now,
    lastModified: ts,
    syncStatus: existing.syncStatus === 'synced' ? 'pending' : existing.syncStatus,
  };
  try {
    await d.products.put(updated);
    await d.syncQueue.add({
      operation: 'UPDATE',
      tableName: 'products',
      data: updated,
      timestamp: ts,
      attempts: 0,
      status: 'pending',
    });
  } catch (e) {
    if (isQuotaExceededError(e)) setOfflineQuotaExceeded();
    throw e;
  }
}

/**
 * Delete a product locally and enqueue a DELETE for sync. The product is removed from
 * the products table immediately; the queue item carries id and a copy of the record
 * for the server (e.g. serverId for the API path).
 *
 * @param {string} id - Product UUID
 * @returns {Promise<void>}
 * @throws {Error} If product not found
 */
export async function deleteProduct(id) {
  const d = await getDB();
  if (!d) throw new Error('IndexedDB unavailable');
  const existing = await d.products.get(id);
  if (!existing) {
    throw new Error(`Product not found: ${id}`);
  }
  try {
    await d.products.delete(id);
    await d.syncQueue.add({
      operation: 'DELETE',
      tableName: 'products',
      data: { id, ...existing },
      timestamp: nowTs(),
      attempts: 0,
      status: 'pending',
    });
  } catch (e) {
    if (isQuotaExceededError(e)) setOfflineQuotaExceeded();
    throw e;
  }
}

/**
 * Mirror product list from API into Dexie (Phase 1: alongside API, UI can still use API/state).
 * Clears products table and bulk-adds with syncStatus: 'synced', serverId = id.
 * Call only when isOfflineEnabled() and after a successful API load. Catches QuotaExceededError.
 *
 * @param {Array<{ id: string, name?: string, sku?: string, category?: string, price?: number, sellingPrice?: number, quantity?: number, description?: string, images?: string[], createdAt?: Date|string, updatedAt?: Date|string }>} apiProducts - Products from API response
 * @returns {Promise<void>}
 */
export async function mirrorProductsFromApi(apiProducts) {
  if (!Array.isArray(apiProducts) || apiProducts.length === 0) return;
  const d = await getDB();
  if (!d) return;
  try {
    await d.products.clear();
    const now = nowISO();
    const ts = nowTs();
    const records = apiProducts.map((p) => {
      if (!p || !p.id) return null;
      return {
        id: p.id,
        name: p.name ?? '',
        sku: p.sku ?? '',
        category: p.category ?? '',
        price: p.price ?? p.sellingPrice ?? 0,
        quantity: p.quantity ?? 0,
        description: p.description ?? '',
        images: Array.isArray(p.images) ? p.images : [],
        createdAt: typeof p.createdAt === 'string' ? p.createdAt : (p.createdAt instanceof Date ? p.createdAt.toISOString() : now),
        updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : (p.updatedAt instanceof Date ? p.updatedAt.toISOString() : now),
        syncStatus: 'synced',
        serverId: p.id,
        lastModified: ts,
        sizeKind: p.sizeKind ?? p.size_kind ?? 'na',
        quantityBySize: Array.isArray(p.quantityBySize) ? p.quantityBySize : [],
      };
    }).filter(Boolean);
    if (records.length > 0) {
      await d.products.bulkAdd(records);
    }
  } catch (e) {
    if (isQuotaExceededError(e)) setOfflineQuotaExceeded();
    if (import.meta.env.DEV) console.warn('mirrorProductsFromApi failed:', e);
  }
}

/**
 * Get all products that are not yet synced (syncStatus !== 'synced').
 * @returns {Promise<ProductRecord[]>}
 */
export async function getUnsyncedItems() {
  const d = await getDB();
  return d ? d.products.where('syncStatus').notEqual('synced').toArray() : [];
}

/**
 * Get pending sync queue items (for background sync).
 * @returns {Promise<SyncQueueItem[]>}
 */
export async function getSyncQueueItems() {
  const d = await getDB();
  return d ? d.syncQueue.where('status').equals('pending').sortBy('timestamp') : Promise.resolve([]);
}

/**
 * Get failed sync queue items (for admin dashboard).
 * @returns {Promise<SyncQueueItem[]>}
 */
export async function getFailedQueueItems() {
  const d = await getDB();
  return d ? d.syncQueue.where('status').equals('failed').sortBy('timestamp').reverse().toArray() : [];
}

/**
 * Get all sync queue items (pending + syncing + failed) for export.
 * @returns {Promise<SyncQueueItem[]>}
 */
export async function getAllSyncQueueItems() {
  const d = await getDB();
  return d ? d.syncQueue.orderBy('timestamp').reverse().toArray() : [];
}

/**
 * Export all local data for user backup (products, sync queue, metadata). Does not include logs.
 * Use with importFromBackup to restore on another device or after clear.
 *
 * @returns {Promise<{ version: number, exportedAt: string, products: ProductRecord[], syncQueue: SyncQueueItem[], metadata: Array<{key: string, value: *, updatedAt: number}> }>}
 */
export async function exportAllData() {
  const d = await getDB();
  if (!d) return { version: 2, exportedAt: new Date().toISOString(), products: [], syncQueue: [], metadata: [] };
  const [products, syncQueue, metadataArr] = await Promise.all([
    d.products.toArray(),
    d.syncQueue.toArray(),
    d.metadata.toArray(),
  ]);
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    products,
    syncQueue,
    metadata: metadataArr.map(({ key, value, updatedAt }) => ({ key, value, updatedAt })),
  };
}

/**
 * Import from a backup previously created with exportAllData. If replace is true, clears
 * products and syncQueue then bulk-adds; metadata is merged by key. If replace is false,
 * only merges products (by id) and appends sync queue items; does not clear.
 *
 * @param {Object} backup - Object from exportAllData()
 * @param {{ replace?: boolean }} [options] - replace: true = clear then restore; false = merge
 * @returns {Promise<{ productsAdded: number, queueAdded: number }>}
 */
export async function importFromBackup(backup, options = {}) {
  const { replace = false } = options;
  const products = Array.isArray(backup.products) ? backup.products : [];
  const syncQueue = Array.isArray(backup.syncQueue) ? backup.syncQueue : [];
  const metadata = Array.isArray(backup.metadata) ? backup.metadata : [];

  const d = await getDB();
  if (!d) return { productsAdded: 0, queueAdded: 0 };

  if (replace) {
    await d.products.clear();
    await d.syncQueue.clear();
  }

  let productsAdded = 0;
  if (products.length > 0) {
    if (replace) {
      await d.products.bulkAdd(products);
      productsAdded = products.length;
    } else {
      for (const p of products) {
        if (p && p.id) {
          await d.products.put(p);
          productsAdded += 1;
        }
      }
    }
  }

  let queueAdded = 0;
  if (syncQueue.length > 0) {
    if (replace) {
      await d.syncQueue.bulkAdd(syncQueue.map(({ id, ...rest }) => rest));
      queueAdded = syncQueue.length;
    } else {
      for (const q of syncQueue) {
        if (q && (q.operation && q.tableName && q.data != null)) {
          const { id, ...rest } = q;
          await d.syncQueue.add(rest);
          queueAdded += 1;
        }
      }
    }
  }

  for (const m of metadata) {
    if (m && m.key != null) {
      await d.metadata.put({ key: m.key, value: m.value, updatedAt: m.updatedAt ?? Date.now() });
    }
  }

  return { productsAdded, queueAdded };
}

/**
 * Clear all items from the sync queue (use with care).
 * @returns {Promise<void>}
 */
export async function clearSyncQueue() {
  const d = await getDB();
  if (d) await d.syncQueue.clear();
}

/**
 * Clear all local product data: products table + sync queue (INTEGRATION_PLAN "Clear local data").
 * Does not clear auth or app settings. Server data is unchanged.
 * @returns {Promise<void>}
 */
export async function clearAllLocalProductData() {
  const d = await getDB();
  if (d) {
    await d.products.clear();
    await d.syncQueue.clear();
  }
}

/**
 * Undo a just-added product: remove from products table and remove CREATE entry from sync queue.
 * Use within a short window (e.g. 10s) after add.
 * @param {string} productId - Product UUID to undo
 * @returns {Promise<void>}
 */
export async function undoAddProduct(productId) {
  const d = await getDB();
  if (!d) return;
  const items = await d.syncQueue.where('status').equals('pending').filter((item) => item.data?.id === productId && item.operation === 'CREATE').toArray();
  for (const item of items) {
    await d.syncQueue.delete(item.id);
  }
  await d.products.delete(productId);
}

/**
 * Store sync validation/error for a product (e.g. when server returns 4xx during sync).
 * @param {string} productId
 * @param {string} message
 * @returns {Promise<void>}
 */
export async function setSyncError(productId, message) {
  const d = await getDB();
  if (d) await d.metadata.put({
    key: `sync_error_${productId}`,
    value: { message, timestamp: Date.now() },
    updatedAt: Date.now(),
  });
}

/**
 * Get stored sync error for a product, if any.
 * @param {string} productId
 * @returns {Promise<{message: string, timestamp: number}|null>}
 */
export async function getSyncError(productId) {
  const d = await getDB();
  if (!d) return null;
  const rec = await d.metadata.get(`sync_error_${productId}`);
  return rec?.value ?? null;
}

/**
 * Clear stored sync error for a product.
 * @param {string} productId
 * @returns {Promise<void>}
 */
export async function clearSyncError(productId) {
  const d = await getDB();
  if (d) await d.metadata.delete(`sync_error_${productId}`);
}

/**
 * Retry a single queue item: set status to pending and reset attempts so processSyncQueue
 * picks it up. Use for failed items that should be retried (e.g. after fixing server or data).
 *
 * @param {number} queueItemId - Sync queue primary key (Dexie auto-increment id)
 * @returns {Promise<void>}
 */
export async function retryQueueItem(queueItemId) {
  const d = await getDB();
  if (d) await d.syncQueue.update(queueItemId, {
    status: 'pending',
    attempts: 0,
    error: null,
  });
}

/**
 * Reset all failed (and stuck syncing) queue items to pending so "Retry all" picks them up.
 * @returns {Promise<number>} Number of items reset
 */
export async function retryAllFailedQueueItems() {
  const d = await getDB();
  if (!d) return 0;
  const failed = await d.syncQueue.where('status').equals('failed').toArray();
  const syncing = await d.syncQueue.where('status').equals('syncing').toArray();
  for (const item of failed) {
    await d.syncQueue.update(item.id, { status: 'pending', attempts: 0, error: null });
  }
  for (const item of syncing) {
    await d.syncQueue.update(item.id, { status: 'pending', error: null });
  }
  return failed.length + syncing.length;
}

/**
 * Delete all failed items from the sync queue.
 * @returns {Promise<number>} Number of items removed
 */
export async function clearFailedQueueItems() {
  const d = await getDB();
  if (!d) return 0;
  const failed = await d.syncQueue.where('status').equals('failed').toArray();
  for (const item of failed) {
    await d.syncQueue.delete(item.id);
  }
  return failed.length;
}

const CONFLICT_PREFERENCE_KEY = 'conflict_resolution_preference';
const CONFLICT_AUDIT_KEY = 'conflict_audit_log';

/**
 * @typedef {'keep_local' | 'keep_server' | 'merge' | 'last_write_wins'} ConflictStrategy
 */

/**
 * Get user's conflict resolution preference.
 * @returns {Promise<ConflictStrategy|null>}
 */
export async function getConflictPreference() {
  const d = await getDB();
  if (!d) return null;
  const rec = await d.metadata.get(CONFLICT_PREFERENCE_KEY);
  return rec?.value ?? null;
}

/**
 * Store conflict resolution preference.
 * @param {ConflictStrategy} strategy
 * @returns {Promise<void>}
 */
export async function setConflictPreference(strategy) {
  const d = await getDB();
  if (d) await d.metadata.put({
    key: CONFLICT_PREFERENCE_KEY,
    value: strategy,
    updatedAt: Date.now(),
  });
}

/**
 * Append an entry to the conflict resolution audit log.
 * @param {{ productId: string, strategy: ConflictStrategy, localUpdatedAt?: number, serverUpdatedAt?: number, resolvedAt: number }} entry
 * @returns {Promise<void>}
 */
export async function appendConflictAuditLog(entry) {
  const d = await getDB();
  if (!d) return;
  const existing = await d.metadata.get(CONFLICT_AUDIT_KEY);
  const log = Array.isArray(existing?.value) ? existing.value : [];
  log.push(entry);
  if (log.length > 500) log.shift();
  await d.metadata.put({
    key: CONFLICT_AUDIT_KEY,
    value: log,
    updatedAt: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// TODO: Consider versioned schema migrations if adding new tables or indexes (Dexie version(2).stores(...)).
// All access is via getDB(). No default export to avoid null transaction (e.g. idb "e.trans" / "n.type") when DB init fails.
