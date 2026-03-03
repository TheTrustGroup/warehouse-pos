/**
 * Global recovery from IndexedDB transaction errors (e.trans / n.type).
 * When Dexie or idb throws "null is not an object (evaluating 'e.trans')" due to a closed
 * or invalid connection, we clear cached DB instances so the next access reopens cleanly.
 * Do not ignore these errors: they can cause repeated failures until caches are cleared.
 */
import { clearDbInstance, isTransactionError } from '../db/inventoryDB';
import { clearLogDbInstance } from '../utils/logger';

/**
 * Call once at app init (e.g. in App.tsx useEffect) to handle unhandled rejections
 * from IndexedDB so the next DB access gets a fresh connection.
 */
export function initIdbErrorRecovery(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('unhandledrejection', (event) => {
    if (!isTransactionError(event.reason)) return;
    clearDbInstance();
    clearLogDbInstance();
    if (import.meta.env?.DEV) {
      console.warn('[idb] Cleared DB caches after transaction error; next access will reopen.');
    }
    event.preventDefault();
    event.stopPropagation();
  });
}
