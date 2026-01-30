/**
 * Safe localStorage utilities with error handling
 */

/**
 * Safely get data from localStorage
 * @param key - Storage key
 * @param defaultValue - Default value if key doesn't exist or parsing fails
 * @returns Parsed data or default value
 */
export function getStoredData<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    if (!item) return defaultValue;
    return JSON.parse(item) as T;
  } catch (error) {
    console.error(`Error reading ${key} from localStorage:`, error);
    return defaultValue;
  }
}

/** Keys we can clear to free quota when warehouse_products must be saved. */
const CLEARABLE_KEYS = ['transactions', 'offline_transactions', 'orders'];

/**
 * Safely set data to localStorage
 * @param key - Storage key
 * @param value - Value to store
 * @returns true if successful, false otherwise
 */
export function setStoredData<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      // Only try to free space for critical keys (e.g. warehouse_products)
      if (key === 'warehouse_products') {
        for (const k of CLEARABLE_KEYS) {
          try {
            localStorage.removeItem(k);
          } catch {
            /* ignore */
          }
        }
        try {
          localStorage.setItem(key, JSON.stringify(value));
          return true;
        } catch {
          console.error('localStorage quota exceeded. Could not free enough space for warehouse_products.');
        }
      } else {
        console.error('localStorage quota exceeded. Consider clearing old data.');
      }
    } else {
      console.error(`Error writing ${key} to localStorage:`, error);
    }
    return false;
  }
}

/**
 * Safely remove data from localStorage
 * @param key - Storage key
 */
export function removeStoredData(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Error removing ${key} from localStorage:`, error);
  }
}

/**
 * Check if localStorage is available
 * @returns true if localStorage is available, false otherwise
 */
export function isStorageAvailable(): boolean {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}
