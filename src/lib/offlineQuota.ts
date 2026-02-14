/**
 * Offline storage quota exceeded: set/read flag and notify UI (toast).
 * When quota is exceeded we fall back to API-only and show a one-time message.
 *
 * @see INTEGRATION_PLAN.md Step 2.2
 */

const QUOTA_FLAG_KEY = 'offline_storage_quota_exceeded';
const QUOTA_EVENT = 'offline-quota-exceeded';

export function setOfflineQuotaExceeded(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(QUOTA_FLAG_KEY, '1');
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(QUOTA_EVENT));
    }
  } catch {
    // ignore
  }
}

export function getOfflineQuotaExceeded(): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(QUOTA_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearOfflineQuotaExceeded(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(QUOTA_FLAG_KEY);
    }
  } catch {
    // ignore
  }
}

/** Call from catch blocks when DOMException.name === 'QuotaExceededError'. */
export function isQuotaExceededError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') return true;
  if (err && typeof err === 'object' && (err as { name?: string }).name === 'QuotaExceededError') return true;
  return false;
}

export { QUOTA_EVENT };
