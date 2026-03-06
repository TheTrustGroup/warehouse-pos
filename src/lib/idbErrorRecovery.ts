/**
 * Global recovery from IndexedDB transaction errors (e.trans / n.type).
 * When Dexie or idb throws "null is not an object (evaluating 'e.trans')" due to a closed
 * or invalid connection, we clear cached DB instances so the next access reopens cleanly.
 * Handles both unhandled rejections (async) and window error (sync) so the error does not
 * leave the app stuck (e.g. POS "Loading warehouse..." when idb throws during another provider).
 */
import { clearDbInstance, isTransactionError } from '../db/inventoryDB';
import { clearLogDbInstance } from '../utils/logger';
import { clearOfflineDbInstance } from './offlineDb';

function clearAllIdbCaches(): void {
  clearDbInstance();
  clearLogDbInstance();
  clearOfflineDbInstance();
  if (import.meta.env?.DEV) {
    console.warn('[idb] Cleared DB caches after transaction error; next access will reopen.');
  }
}

/**
 * Call once at app init (e.g. in App.tsx useEffect) to handle unhandled rejections
 * and synchronous errors from IndexedDB so the next DB access gets a fresh connection.
 */
export function initIdbErrorRecovery(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('unhandledrejection', (event) => {
    if (!isTransactionError(event.reason)) return;
    clearAllIdbCaches();
    event.preventDefault();
    event.stopPropagation();
  });

  window.addEventListener('error', (event) => {
    const msg = event.message ?? String(event.error ?? '');
    if (!isTransactionError(new Error(msg))) return;
    clearAllIdbCaches();
    event.preventDefault();
    return true;
  });
}
