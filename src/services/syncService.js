/**
 * Sync service: processes sync queue (Dexie) and pushes/pulls from API.
 * Emits events for UI: sync-started, sync-progress, sync-completed, sync-failed, sync-conflict.
 *
 * Flow: processSyncQueue() reads pending items (oldest first), marks each 'syncing',
 * calls syncSingleItem() (POST/PUT/DELETE). On 409, runs conflict resolution (last-write-wins
 * or user modal). On 5xx/network error, increments attempts and applies exponential backoff;
 * after MAX_ATTEMPTS (5) marks item as 'failed'. On 404 for DELETE, item is treated as synced
 * (already deleted on server).
 *
 * @module services/syncService
 * @see docs/OFFLINE_ARCHITECTURE.md
 */

import { db, setSyncError, getConflictPreference, appendConflictAuditLog } from '../db/inventoryDB';
import { API_BASE_URL } from '../lib/api';
import { apiPost, apiPut, apiDelete, apiGet } from '../lib/apiClient';
import { logSync } from '../utils/logger';
import { recordSyncSuccess, recordSyncFailure, recordConflict } from '../lib/telemetry';

const MAX_ATTEMPTS = 5;
const AUTO_SYNC_INTERVAL_MS = 30_000;

/** Valid operations for the sync queue. */
const OPERATIONS = /** @type {const} */ (['CREATE', 'UPDATE', 'DELETE']);
/** Valid table names. */
const TABLE_NAMES = /** @type {const} */ (['products']);
// TODO: Support additional tableNames (e.g. 'orders') and corresponding API paths in syncSingleItem.

/**
 * Max size for a single image (base64) to include in sync payload. Larger images are omitted
 * to avoid 413 / body limit (e.g. Vercel 4.5MB), which often surfaces as "Load failed".
 */
const MAX_IMAGE_SIZE_SYNC = 100_000; // ~100KB per image

/**
 * Build API payload from Dexie product record. Images are stripped or limited so sync POST
 * stays under server body limit (avoids "Load failed" after first few products with large images).
 * @param {Object} data - Record from sync queue (product shape)
 * @returns {Record<string, unknown>}
 */
function buildProductPayload(data) {
  const rawImages = Array.isArray(data.images) ? data.images : [];
  const images = rawImages
    .filter((img) => typeof img === 'string' && img.length <= MAX_IMAGE_SIZE_SYNC)
    .slice(0, 5);
  return {
    id: data.id,
    name: data.name ?? '',
    sku: data.sku ?? '',
    category: data.category ?? '',
    quantity: data.quantity ?? 0,
    sellingPrice: data.price ?? 0,
    costPrice: data.price ?? 0,
    description: data.description ?? '',
    images,
    barcode: data.barcode ?? '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    reorderLevel: data.reorderLevel ?? 0,
    location: data.location && typeof data.location === 'object' ? data.location : { warehouse: '', aisle: '', rack: '', bin: '' },
    supplier: data.supplier && typeof data.supplier === 'object' ? data.supplier : { name: '', contact: '', email: '' },
    expiryDate: data.expiryDate ?? null,
    createdBy: data.createdBy ?? '',
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
    ...(data.warehouseId && { warehouseId: data.warehouseId }),
  };
}

/**
 * Check if the environment is "online" (browser API when available).
 * @returns {boolean}
 */
function isOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine != null) {
    return navigator.onLine;
  }
  return true;
}

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * SyncService: processes sync queue, talks to API, emits events.
 */
/**
 * @typedef {'keep_local' | 'keep_server' | 'merge' | 'last_write_wins'} ConflictStrategy
 * @typedef {{ strategy: ConflictStrategy, mergedPayload?: Object, serverDeleted?: boolean }} ConflictResolution
 */

export class SyncService {
  constructor() {
    /** @type {EventTarget} */
    this._emitter = new EventTarget();
    /** @type {ReturnType<typeof setInterval> | null} */
    this._autoSyncIntervalId = null;
    /** @type {Map<number, { resolve: (r: ConflictResolution) => void, reject: (err: Error) => void }>} */
    this._conflictResolvers = new Map();
  }

  /**
   * Subscribe to sync events. Use addEventListener('sync-started', handler), etc.
   * @returns {EventTarget}
   */
  getEmitter() {
    return this._emitter;
  }

  /**
   * Emit a custom event (internal).
   * @param {string} name
   * @param {*} [detail]
   */
  _emit(name, detail) {
    this._emitter.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /**
   * Add an operation to the sync queue. Validates before adding.
   * @param {'CREATE' | 'UPDATE' | 'DELETE'} operation
   * @param {'products'} tableName
   * @param {Object} data - Full record for the operation (e.g. product object)
   * @returns {Promise<number>} The queue item ID (Dexie auto-increment id)
   */
  async addToQueue(operation, tableName, data) {
    if (!OPERATIONS.includes(operation)) {
      throw new Error(`Invalid operation: ${operation}. Must be one of ${OPERATIONS.join(', ')}.`);
    }
    if (!TABLE_NAMES.includes(tableName)) {
      throw new Error(`Invalid tableName: ${tableName}. Must be one of ${TABLE_NAMES.join(', ')}.`);
    }
    if (data == null || typeof data !== 'object') {
      throw new Error('data must be a non-null object.');
    }
    const ts = Date.now();
    const item = {
      operation,
      tableName,
      data: { ...data },
      timestamp: ts,
      attempts: 0,
      status: 'pending',
    };
    const id = await db.syncQueue.add(item);
    return id;
  }

  /**
   * Sync a single queue item to the server. Maps operation to API endpoint.
   * CREATE uses Idempotency-Key (client id) so retries do not create duplicates.
   * Edge cases: tableName other than 'products' returns success: false; caught errors
   * expose status (e.g. 409, 404, 5xx) for processSyncQueue to handle.
   *
   * @param {{ id: number, operation: string, tableName: string, data: Object }} queueItem
   * @returns {Promise<{success: boolean, data?: any, error?: string, status?: number}>}
   */
  async syncSingleItem(queueItem) {
    const { operation, tableName, data } = queueItem;
    if (tableName !== 'products') {
      return { success: false, error: `Unsupported table: ${tableName}` };
    }

    const basePath = '/api/products';
    const idForApi = data.serverId || data.id;

    try {
      if (operation === 'CREATE') {
        const payload = buildProductPayload(data);
        const result = await apiPost(API_BASE_URL, basePath, payload, {
          idempotencyKey: data.id,
        });
        return { success: true, data: result };
      }
      if (operation === 'UPDATE') {
        const payload = buildProductPayload(data);
        await apiPut(API_BASE_URL, `${basePath}/${idForApi}`, payload);
        return { success: true, data: payload };
      }
      if (operation === 'DELETE') {
        await apiDelete(API_BASE_URL, `${basePath}/${idForApi}`);
        return { success: true };
      }
      return { success: false, error: `Unknown operation: ${operation}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = err?.status ?? (err?.response?.status);
      return { success: false, error: message, status };
    }
  }

  /**
   * Conflict resolution: Last Write Wins using lastModified (local) vs updatedAt (server).
   * @param {Object} localData - Local record (has lastModified in ms)
   * @param {Object} serverData - Server record (has updatedAt as ISO string or ms)
   * @returns {Object} Resolved record (the newer of the two)
   */
  handleConflict(localData, serverData) {
    const localTs =
      typeof localData.lastModified === 'number'
        ? localData.lastModified
        : new Date(localData.updatedAt || 0).getTime();
    let serverTs = 0;
    if (typeof serverData.updatedAt === 'number') {
      serverTs = serverData.updatedAt;
    } else if (serverData.updatedAt) {
      serverTs = new Date(serverData.updatedAt).getTime();
    }
    const keepLocal = localTs >= serverTs;
    const resolved = keepLocal ? { ...localData } : { ...serverData };
    if (import.meta.env?.DEV) {
      console.warn('[SyncService] Conflict resolved (last write wins):', {
        localTs,
        serverTs,
        keepLocal,
        id: localData.id || serverData.id,
      });
    }
    return resolved;
  }

  /**
   * Wait for UI to resolve a conflict. Emits 'sync-conflict'; resolution comes via resolveConflict().
   * @param {number} queueId
   * @param {{ item: Object, localData: Object, serverData: Object|null, serverDeleted?: boolean }} payload
   * @returns {Promise<ConflictResolution>}
   */
  _waitForConflictResolution(queueId, payload) {
    return new Promise((resolve, reject) => {
      this._conflictResolvers.set(queueId, { resolve, reject });
      this._emit('sync-conflict', { queueId, ...payload });
    });
  }

  /**
   * Resolve a conflict (called by ConflictModal or auto when preference is last_write_wins).
   * @param {number} queueId
   * @param {ConflictResolution} resolution
   */
  resolveConflict(queueId, resolution) {
    const entry = this._conflictResolvers.get(queueId);
    if (entry) {
      this._conflictResolvers.delete(queueId);
      entry.resolve(resolution);
    }
  }

  /**
   * Reject a conflict (e.g. user closed modal without choosing). Puts queue item back to pending.
   * @param {number} queueId
   */
  rejectConflict(queueId) {
    const entry = this._conflictResolvers.get(queueId);
    if (entry) {
      this._conflictResolvers.delete(queueId);
      entry.reject(new Error('Conflict resolution cancelled'));
    }
  }

  /**
   * Apply conflict resolution: update DB and/or retry API, then remove from queue or leave for retry.
   * @param {number} queueId
   * @param {Object} item - Queue item
   * @param {ConflictResolution} resolution
   * @returns {Promise<boolean>} true if resolved (queue item removed), false otherwise
   */
  async _applyConflictResolution(queueId, item, resolution) {
    const { strategy, mergedPayload, serverDeleted } = resolution;
    const { operation, tableName, data } = item;
    const basePath = '/api/products';
    const idForApi = data.serverId || data.id;

    const toPayload = (rec) => ({
      ...buildProductPayload(rec),
      updatedAt: rec.updatedAt ?? new Date().toISOString(),
    });

    try {
      if (serverDeleted && strategy === 'keep_server') {
        await db.products.delete(data.id);
        await db.syncQueue.delete(queueId);
        return true;
      }
      if (serverDeleted && strategy === 'keep_local') {
        const payload = toPayload(data);
        const created = await apiPost(API_BASE_URL, basePath, payload, { idempotencyKey: data.id });
        const serverId = created?.id ?? idForApi;
        await db.products.update(data.id, { serverId, syncStatus: 'synced' });
        await db.syncQueue.delete(queueId);
        return true;
      }
      if (strategy === 'keep_server') {
        const serverData = mergedPayload || (await apiGet(API_BASE_URL, `${basePath}/${idForApi}`));
        const productId = data.id;
        await db.products.update(productId, {
          name: serverData.name,
          sku: serverData.sku,
          category: serverData.category,
          price: serverData.sellingPrice ?? serverData.price,
          quantity: serverData.quantity,
          description: serverData.description,
          syncStatus: 'synced',
          serverId: serverData.id ?? idForApi,
          lastModified: serverData.updatedAt ? new Date(serverData.updatedAt).getTime() : Date.now(),
        });
        await db.syncQueue.delete(queueId);
        return true;
      }
      if (strategy === 'merge' && mergedPayload) {
        const payload = toPayload(mergedPayload);
        await apiPut(API_BASE_URL, `${basePath}/${idForApi}`, payload);
        await db.products.update(data.id, {
          ...mergedPayload,
          syncStatus: 'synced',
          serverId: idForApi,
          lastModified: Date.now(),
        });
        await db.syncQueue.delete(queueId);
        return true;
      }
      if (strategy === 'last_write_wins' && item.data) {
        const serverData = await this._fetchServerVersion(idForApi);
        if (!serverData) {
          await db.syncQueue.update(queueId, { status: 'pending', error: 'Could not fetch server version' });
          return false;
        }
        const resolved = this.handleConflict(data, serverData);
        const keepLocal =
          typeof data.lastModified === 'number' && resolved.lastModified === data.lastModified;
        if (keepLocal || resolved === data) {
          const payload = toPayload(data);
          await apiPut(API_BASE_URL, `${basePath}/${idForApi}`, payload);
          await db.products.update(data.id, { syncStatus: 'synced', serverId: idForApi });
        } else {
          await db.products.update(data.id, {
            name: resolved.name,
            sku: resolved.sku,
            category: resolved.category,
            price: resolved.sellingPrice ?? resolved.price,
            quantity: resolved.quantity,
            syncStatus: 'synced',
            serverId: idForApi,
            lastModified: resolved.updatedAt ? new Date(resolved.updatedAt).getTime() : Date.now(),
          });
        }
        await db.syncQueue.delete(queueId);
        return true;
      }
      if (strategy === 'keep_local') {
        const payload = toPayload(data);
        await apiPut(API_BASE_URL, `${basePath}/${idForApi}`, payload);
        await db.products.update(data.id, { syncStatus: 'synced', serverId: idForApi });
        await db.syncQueue.delete(queueId);
        return true;
      }
    } catch (err) {
      if (import.meta.env?.DEV) console.warn('[SyncService] Apply conflict resolution failed:', err);
      await db.syncQueue.update(queueId, { status: 'pending', error: err?.message ?? String(err) });
      return false;
    }
    return false;
  }

  /**
   * Fetch current product from server (for conflict resolution).
   * @param {string} idForApi
   * @returns {Promise<Object|null>}
   */
  async _fetchServerVersion(idForApi) {
    try {
      return await apiGet(API_BASE_URL, `/api/products/${idForApi}`);
    } catch {
      return null;
    }
  }

  /**
   * Process all pending sync queue items in chronological order. On success updates
   * product serverId/syncStatus and removes from queue; on failure increments attempts
   * and applies exponential backoff; after MAX_ATTEMPTS marks as failed.
   *
   * Edge cases: (1) Offline → returns immediately with sync-failed reason 'offline'.
   * (2) 409 Conflict → conflict resolution (auto or modal); identical content is
   * auto-resolved without modal. (3) 404 on DELETE → treat as success (server already
   * deleted). (4) 4xx with item.data.id → setSyncError() for product-level error display.
   *
   * @returns {Promise<{synced: number[], failed: number[], pending: number[]}>} Queue ids by outcome.
   */
  async processSyncQueue() {
    const startMs = Date.now();
    const summary = { synced: [], failed: [], pending: [] };
    if (!isOnline()) {
      logSync('sync skipped', { reason: 'offline' });
      this._emit('sync-failed', { reason: 'offline', summary });
      return summary;
    }

    const items = await db.syncQueue.where('status').equals('pending').sortBy('timestamp');
    const total = items.length;
    if (total === 0) {
      logSync('sync completed', { reason: 'empty' });
      this._emit('sync-completed', { summary, percent: 100 });
      return summary;
    }

    logSync('sync started', { total });
    this._emit('sync-started', { total });

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const queueId = item.id;

      // Mark as syncing (optional; we don't have a 'syncing' state in schema but we can update status for UI)
      await db.syncQueue.update(queueId, { status: 'syncing' });

      const result = await this.syncSingleItem(item);

      if (result.success) {
        if (item.tableName === 'products' && item.operation === 'CREATE' && result.data?.id) {
          const serverId = result.data.id;
          const localId = item.data.id;
          await db.products.update(localId, {
            serverId,
            syncStatus: 'synced',
          });
        } else if (item.tableName === 'products' && (item.operation === 'UPDATE' || item.operation === 'CREATE')) {
          const id = item.data.id;
          const serverId = result.data?.id ?? item.data.serverId ?? id;
          await db.products.update(id, {
            serverId,
            syncStatus: 'synced',
          });
        }
        await db.syncQueue.delete(queueId);
        summary.synced.push(queueId);
      } else if (result.status === 409 && item.tableName === 'products') {
        recordConflict().catch(() => {});
        const idForApi = item.data.serverId || item.data.id;
        let serverData = null;
        let serverDeleted = false;
        try {
          serverData = await this._fetchServerVersion(idForApi);
        } catch (e) {
          if (e?.status === 404) serverDeleted = true;
        }
        const localData = item.data;
        const preference = await getConflictPreference();
        if (preference === 'last_write_wins' && serverData) {
          const resolved = this.handleConflict(localData, serverData);
          const applied = await this._applyConflictResolution(queueId, item, {
            strategy: 'last_write_wins',
            mergedPayload: resolved,
          });
          if (applied) summary.synced.push(queueId);
          else summary.pending.push(queueId);
        } else if (serverDeleted) {
          try {
            const resolution = await this._waitForConflictResolution(queueId, {
              item,
              localData,
              serverData: null,
              serverDeleted: true,
            });
            const applied = await this._applyConflictResolution(queueId, item, resolution);
            if (applied) summary.synced.push(queueId);
            else summary.pending.push(queueId);
          } catch (err) {
            await db.syncQueue.update(queueId, { status: 'pending', error: null });
            summary.pending.push(queueId);
          }
        } else {
          const identical =
            serverData &&
            ['name', 'sku', 'category', 'price', 'quantity'].every(
              (k) => String(localData[k] ?? '') === String(serverData[k] ?? '')
            );
          if (identical) {
            await db.products.update(localData.id, { syncStatus: 'synced', serverId: idForApi });
            await db.syncQueue.delete(queueId);
            summary.synced.push(queueId);
          } else {
            try {
              const resolution = await this._waitForConflictResolution(queueId, {
                item,
                localData,
                serverData,
              });
              const applied = await this._applyConflictResolution(queueId, item, resolution);
              if (applied) summary.synced.push(queueId);
              else summary.pending.push(queueId);
            } catch (err) {
              await db.syncQueue.update(queueId, { status: 'pending', error: null });
              summary.pending.push(queueId);
            }
          }
        }
      } else if (result.status === 404 && item.operation === 'DELETE') {
        await db.syncQueue.delete(queueId);
        summary.synced.push(queueId);
      } else {
        const attempts = (item.attempts || 0) + 1;
        const status = result.status;
        const rawMsg = result.error || 'Unknown error';
        const errorMsg =
          status != null && status >= 400
            ? `[${status}] ${rawMsg}`
            : rawMsg;
        const isFinalFailure = attempts > MAX_ATTEMPTS;
        if (status >= 400 && status < 500 && item.data?.id) {
          try {
            await setSyncError(item.data.id, errorMsg);
          } catch (_) {}
        }
        await db.syncQueue.update(queueId, {
          attempts,
          error: errorMsg,
          status: isFinalFailure ? 'failed' : 'pending',
        });
        if (isFinalFailure) {
          summary.failed.push(queueId);
          recordSyncFailure().catch(() => {});
          this._emit('sync-failed', { queueId, error: errorMsg, item });
        } else {
          summary.pending.push(queueId);
          const backoffSeconds = Math.pow(2, attempts);
          await delay(backoffSeconds * 1000);
        }
      }

      const percent = total > 0 ? Math.round(((i + 1) / total) * 100) : 100;
      this._emit('sync-progress', { percent, current: i + 1, total });
    }

    const durationMs = Date.now() - startMs;
    logSync('sync completed', { summary, durationMs });
    if (summary.synced.length > 0) recordSyncSuccess(durationMs).catch(() => {});
    if (summary.failed.length > 0) recordSyncFailure().catch(() => {});
    this._emit('sync-completed', { summary, percent: 100 });
    return summary;
  }

  /**
   * Start auto-sync: run processSyncQueue every 30 seconds when online. Cancellable via stopAutoSync().
   */
  startAutoSync() {
    if (this._autoSyncIntervalId != null) return;
    this._autoSyncIntervalId = setInterval(() => {
      if (isOnline()) {
        this.processSyncQueue().catch((err) => {
          if (import.meta.env?.DEV) {
            console.warn('[SyncService] Auto-sync error:', err);
          }
          this._emit('sync-failed', { reason: 'auto-sync', error: err?.message ?? String(err) });
        });
      }
    }, AUTO_SYNC_INTERVAL_MS);
  }

  /**
   * Stop auto-sync (clears the interval).
   */
  stopAutoSync() {
    if (this._autoSyncIntervalId != null) {
      clearInterval(this._autoSyncIntervalId);
      this._autoSyncIntervalId = null;
    }
  }

  /**
   * Get queue status counts for UI indicators (e.g. sync badge, Admin dashboard).
   * @returns {Promise<{pending: number, syncing: number, failed: number}>}
   */
  async getQueueStatus() {
    const [pending, syncing, failed] = await Promise.all([
      db.syncQueue.where('status').equals('pending').count(),
      db.syncQueue.where('status').equals('syncing').count(),
      db.syncQueue.where('status').equals('failed').count(),
    ]);
    return { pending, syncing, failed };
  }
}

/** Singleton instance. */
export const syncService = new SyncService();
export default syncService;
