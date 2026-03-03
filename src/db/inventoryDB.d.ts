/**
 * Type declarations for inventoryDB.js (Dexie lazy-init via getDB).
 */
export interface InventoryDBInstance {
  products: {
    toArray(): Promise<unknown[]>;
    count(): Promise<number>;
    update(id: string, data: unknown): Promise<void>;
    delete(id: string): Promise<void>;
    clear(): Promise<void>;
    get(id: string): Promise<unknown>;
    where(index: string): unknown;
    put(record: unknown): Promise<void>;
    bulkAdd(records: unknown[]): Promise<void>;
  };
  syncQueue: {
    add(item: unknown): Promise<number>;
    count(): Promise<number>;
    toArray(): Promise<unknown[]>;
    orderBy(index: string): { toArray(): Promise<unknown[]>; reverse(): { toArray(): Promise<unknown[]> } };
    where(index: string): {
      equals(val: string): { count(): Promise<number>; sortBy(index: string): Promise<unknown[]>; filter(fn: (x: unknown) => boolean): { toArray(): Promise<unknown[]> } };
      orderBy(index: string): { reverse(): { toArray(): Promise<unknown[]> } };
    };
    update(id: number, data: unknown): Promise<void>;
    delete(id: number): Promise<void>;
    clear(): Promise<void>;
  };
  metadata: {
    get(key: string): Promise<unknown>;
    put(record: unknown): Promise<void>;
    delete(key: string): Promise<void>;
    toArray(): Promise<unknown[]>;
  };
}

export function getDB(): Promise<InventoryDBInstance | null>;
export function clearDbInstance(): void;
export function isTransactionError(e: unknown): boolean;

export function getAllProducts(): Promise<unknown[]>;
export function getProductById(id: string): Promise<unknown>;
export function addProduct(data: unknown): Promise<string>;
export function updateProduct(id: string, data: unknown): Promise<void>;
export function deleteProduct(id: string): Promise<void>;
export function mirrorProductsFromApi(apiProducts: unknown[]): Promise<void>;
export function getUnsyncedItems(): Promise<unknown[]>;
export function getSyncQueueItems(): Promise<unknown[]>;
export function getFailedQueueItems(): Promise<unknown[]>;
export function getAllSyncQueueItems(): Promise<unknown[]>;
export function exportAllData(): Promise<{ version: number; exportedAt: string; products: unknown[]; syncQueue: unknown[]; metadata: unknown[] }>;
export function importFromBackup(backup: unknown, options?: { replace?: boolean }): Promise<{ productsAdded: number; queueAdded: number }>;
export function clearSyncQueue(): Promise<void>;
export function clearAllLocalProductData(): Promise<void>;
export function undoAddProduct(productId: string): Promise<void>;
export function setSyncError(productId: string, message: string): Promise<void>;
export function getSyncError(productId: string): Promise<unknown>;
export function clearSyncError(productId: string): Promise<void>;
export function retryQueueItem(queueItemId: number): Promise<void>;
export function retryAllFailedQueueItems(): Promise<number>;
export function clearFailedQueueItems(): Promise<number>;
export function getConflictPreference(): Promise<string | null>;
export function setConflictPreference(strategy: string): Promise<void>;
export function appendConflictAuditLog(entry: unknown): Promise<void>;
