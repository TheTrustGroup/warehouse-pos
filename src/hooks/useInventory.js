/**
 * Offline-first inventory hook: Dexie live queries + CRUD + sync.
 * Abstracts all offline operations; use this instead of direct API calls for product list and mutations.
 * @module hooks/useInventory
 */

import { useCallback, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/inventoryDB';
import * as inventoryDb from '../db/inventoryDB';
import { syncService } from '../services/syncService';
import { isOfflineEnabled } from '../lib/offlineFeatureFlag';

/**
 * Normalize productData (partial) to the shape expected by inventoryDB (name, sku, category, price, quantity, etc.).
 * @param {Object} productData - Any object with at least name, sku, category
 * @returns {Object} Record for ProductRecord
 */
function toRecord(productData) {
  return {
    name: productData.name ?? '',
    sku: productData.sku ?? '',
    category: productData.category ?? '',
    price: productData.price ?? productData.sellingPrice ?? 0,
    quantity: productData.quantity ?? 0,
    description: productData.description ?? '',
    images: Array.isArray(productData.images) ? productData.images : [],
  };
}

/**
 * Map Dexie ProductRecord to app Product-like shape (dates as Date, sellingPrice from price).
 * @param {Object} record - ProductRecord from Dexie
 * @returns {Object} Product-like object for UI
 */
function recordToProduct(record) {
  if (!record) return null;
  return {
    ...record,
    sellingPrice: record.price,
    costPrice: record.price,
    barcode: record.barcode ?? '',
    tags: Array.isArray(record.tags) ? record.tags : [],
    reorderLevel: record.reorderLevel ?? 0,
    location: record.location && typeof record.location === 'object' ? record.location : { warehouse: '', aisle: '', rack: '', bin: '' },
    supplier: record.supplier && typeof record.supplier === 'object' ? record.supplier : { name: '', contact: '', email: '' },
    expiryDate: record.expiryDate ? new Date(record.expiryDate) : null,
    createdBy: record.createdBy ?? '',
    createdAt: record.createdAt ? new Date(record.createdAt) : new Date(),
    updatedAt: record.updatedAt ? new Date(record.updatedAt) : new Date(),
  };
}

/**
 * Offline-first inventory hook.
 * - products: live array from IndexedDB (undefined while loading)
 * - unsyncedCount: live count of pending items
 * - addProduct / updateProduct / deleteProduct: local-first + sync queue, trigger sync if online
 * - forceSync: manually run processSyncQueue with loading state
 * - clearFailedSync: remove a failed queue item by id (admin)
 * @returns {{
 *   products: import('../db/inventoryDB').ProductRecord[] | undefined,
 *   unsyncedCount: number | undefined,
 *   addProduct: (productData: Object) => Promise<string>,
 *   updateProduct: (id: string, updates: Object) => Promise<void>,
 *   deleteProduct: (id: string) => Promise<void>,
 *   forceSync: () => Promise<void>,
 *   clearFailedSync: (queueItemId: number) => Promise<void>,
 *   isLoading: boolean,
 *   isSyncing: boolean,
 * }}
 */
export function useInventory() {
  const products = useLiveQuery(() => db.products.toArray(), []);
  const unsyncedCount = useLiveQuery(
    () => db.products.where('syncStatus').notEqual('synced').count(),
    []
  );
  const [isSyncing, setIsSyncing] = useState(false);

  const addProduct = useCallback(async (productData) => {
    const record = toRecord(productData);
    const id = await inventoryDb.addProduct(record);
    if (typeof navigator !== 'undefined' && navigator.onLine && isOfflineEnabled()) {
      syncService.processSyncQueue().catch(() => {});
    }
    return id;
  }, []);

  const updateProduct = useCallback(async (id, updates) => {
    const record = toRecord(updates);
    await inventoryDb.updateProduct(id, record);
    if (typeof navigator !== 'undefined' && navigator.onLine && isOfflineEnabled()) {
      syncService.processSyncQueue().catch(() => {});
    }
  }, []);

  const deleteProduct = useCallback(async (id) => {
    await inventoryDb.deleteProduct(id);
    if (typeof navigator !== 'undefined' && navigator.onLine && isOfflineEnabled()) {
      syncService.processSyncQueue().catch(() => {});
    }
  }, []);

  const forceSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncService.processSyncQueue();
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const clearFailedSync = useCallback(async (queueItemId) => {
    await db.syncQueue.delete(queueItemId);
  }, []);

  /** Undo a just-added product (remove from Dexie + sync queue). Call within ~10s of add. */
  const undoAddProduct = useCallback(async (productId) => {
    await inventoryDb.undoAddProduct(productId);
  }, []);

  const isLoading = products === undefined;
  const productsNormalized = products === undefined ? undefined : products.map(recordToProduct);

  return {
    products: productsNormalized,
    unsyncedCount: unsyncedCount ?? undefined,
    addProduct,
    updateProduct,
    deleteProduct,
    forceSync,
    clearFailedSync,
    undoAddProduct,
    isLoading,
    isSyncing,
  };
}

export default useInventory;
