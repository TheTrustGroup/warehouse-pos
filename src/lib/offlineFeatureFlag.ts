/**
 * Feature flag for offline mode. Use to gate IndexedDB + sync queue + service worker
 * so existing API-based behavior is preserved when the flag is off.
 *
 * Set VITE_OFFLINE_ENABLED=true to enable. Optionally set VITE_OFFLINE_ROLLOUT_PERCENT
 * (0-100) to enable for a percentage of users (e.g. 10 for 10%).
 *
 * @see INTEGRATION_PLAN.md
 */

const OFFLINE_ENABLED =
  typeof import.meta.env !== 'undefined' &&
  String(import.meta.env.VITE_OFFLINE_ENABLED || '').toLowerCase() === 'true';

const ROLLOUT_PERCENT = (() => {
  if (typeof import.meta.env === 'undefined') return 0;
  const v = import.meta.env.VITE_OFFLINE_ROLLOUT_PERCENT;
  if (v === undefined || v === '') return 100;
  const n = parseInt(String(v), 10);
  if (Number.isNaN(n) || n < 0) return 0;
  if (n > 100) return 100;
  return n;
})();

/**
 * Stable seed for rollout. Uses a value that persists for the session so the same
 * user gets the same result (e.g. sessionStorage or a hash of origin + userAgent).
 */
function getRolloutSeed(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    let seed = sessionStorage.getItem('offline_rollout_seed');
    if (!seed) {
      seed = `${window.location.origin}-${navigator.userAgent}-${Date.now()}`;
      sessionStorage.setItem('offline_rollout_seed', seed);
    }
    return seed;
  } catch {
    return `${typeof location !== 'undefined' ? location.origin : ''}-${Math.random()}`;
  }
}

/** Simple string hash for rollout bucket. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h = (h << 5) - h + c;
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * Whether offline mode (IndexedDB + sync queue + optional SW) should be used.
 * When false, use API-only path. When true, use offline-first path.
 *
 * If VITE_OFFLINE_ROLLOUT_PERCENT is set, only that percentage of sessions
 * get offline enabled (based on a stable session seed).
 */
export function isOfflineEnabled(): boolean {
  if (!OFFLINE_ENABLED) return false;
  if (ROLLOUT_PERCENT >= 100) return true;
  if (ROLLOUT_PERCENT <= 0) return false;
  const seed = getRolloutSeed();
  const bucket = hashString(seed) % 100;
  return bucket < ROLLOUT_PERCENT;
}
