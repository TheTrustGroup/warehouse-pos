/**
 * Safe localStorage utilities with error handling and in-memory fallback when storage is unavailable (private mode, old browsers).
 */

const memoryFallback = new Map<string, string>();

function getStorage(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Safely get data from localStorage (or in-memory fallback when unavailable)
 * @param key - Storage key
 * @param defaultValue - Default value if key doesn't exist or parsing fails
 * @returns Parsed data or default value
 */
export function getStoredData<T>(key: string, defaultValue: T): T {
  try {
    const storage = getStorage();
    const item = storage ? storage.getItem(key) : memoryFallback.get(key);
    if (item == null) return defaultValue;
    return JSON.parse(item) as T;
  } catch (error) {
    if (import.meta.env.DEV) console.error(`Error reading ${key} from localStorage:`, error);
    return defaultValue;
  }
}

/** Keys we can clear to free quota when warehouse_products must be saved. warehouse_products is never cleared; only overwritten with updated list (e.g. after user-initiated delete). */
const CLEARABLE_KEYS = ['transactions', 'offline_transactions', 'orders'];

/**
 * Safely set data to localStorage
 * @param key - Storage key
 * @param value - Value to store
 * @returns true if successful, false otherwise
 */
export function setStoredData<T>(key: string, value: T): boolean {
  const str = JSON.stringify(value);
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(key, str);
      memoryFallback.set(key, str);
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        if (key === 'warehouse_products' || key.startsWith('warehouse_products_')) {
          for (const k of CLEARABLE_KEYS) {
            try { storage.removeItem(k); } catch { /* ignore */ }
          }
          try {
            storage.setItem(key, str);
            memoryFallback.set(key, str);
            return true;
          } catch {
            if (import.meta.env.DEV) console.error('localStorage quota exceeded. Could not free enough space for inventory cache.');
          }
        } else {
          if (import.meta.env.DEV) console.error('localStorage quota exceeded. Consider clearing old data.');
        }
      } else {
        if (import.meta.env.DEV) console.error(`Error writing ${key} to localStorage:`, error);
      }
      return false;
    }
  }
  memoryFallback.set(key, str);
  return true;
}

/**
 * Safely remove data from localStorage
 * @param key - Storage key
 */
export function removeStoredData(key: string): void {
  memoryFallback.delete(key);
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(key);
    } catch (error) {
      if (import.meta.env.DEV) console.error(`Error removing ${key} from localStorage:`, error);
    }
  }
}

/**
 * Check if localStorage is available
 * @returns true if localStorage is available, false otherwise
 */
export function isStorageAvailable(): boolean {
  return getStorage() !== null;
}
