/**
 * Tracks browser online/offline and server reachability via periodic health check.
 * @module hooks/useNetworkStatus
 */

import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../lib/api';

const HEALTH_CHECK_INTERVAL_MS = 60_000;
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

/**
 * Perform a single health check: GET /api/health with timeout.
 * Uses credentials: 'omit' to avoid CORS preflight where possible.
 * @param {string} [baseUrl] - API base URL (defaults to API_BASE_URL)
 * @returns {Promise<boolean>} True if server responded with 2xx
 */
export async function checkServerReachable(baseUrl = API_BASE_URL) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/health`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * React hook: online/offline status + periodic server health check.
 * @returns {{
 *   isOnline: boolean,
 *   isServerReachable: boolean,
 *   lastChecked: Date,
 *   checkConnection: () => Promise<boolean>
 * }}
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isServerReachable, setIsServerReachable] = useState(true);
  const [lastChecked, setLastChecked] = useState(() => new Date());

  const checkConnection = useCallback(async () => {
    const reached = await checkServerReachable();
    setLastChecked(new Date());
    setIsServerReachable(reached);
    return reached;
  }, []);

  // Browser online/offline events
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Periodic health check every 60s (only when browser says online)
  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;
    const run = async () => {
      const reached = await checkServerReachable();
      if (!cancelled) {
        setLastChecked(new Date());
        setIsServerReachable(reached);
      }
    };
    run();
    const id = setInterval(run, HEALTH_CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isOnline]);

  return {
    isOnline,
    isServerReachable,
    lastChecked,
    checkConnection,
  };
}

export default useNetworkStatus;
