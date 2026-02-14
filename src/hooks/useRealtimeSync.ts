/**
 * Real-time sync: poll refresh callbacks when tab is visible.
 * Use for inventory and orders so multiple tabs/devices get updates.
 *
 * Future: Consider WebSocket (e.g. Supabase Realtime or custom WS) for push-based
 * updates instead of polling — reduces latency and server load when many clients
 * are open. Polling remains simple and works without WS infrastructure.
 */

import { useEffect, useRef } from 'react';

const DEFAULT_INTERVAL_MS = 60_000; // 1 minute

export interface UseRealtimeSyncOptions {
  /** Callback to refetch data (e.g. loadProducts, loadOrders). */
  onSync: () => void | Promise<void>;
  /** Polling interval in ms. Default 60000. */
  intervalMs?: number;
  /** If true, do not poll (e.g. when not on the relevant page). */
  disabled?: boolean;
}

export function useRealtimeSync(options: UseRealtimeSyncOptions): void {
  const { onSync, intervalMs = DEFAULT_INTERVAL_MS, disabled = false } = options;
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  useEffect(() => {
    if (disabled || intervalMs <= 0) return;

    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      Promise.resolve(onSyncRef.current()).catch(() => {});
    };

    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, disabled]);
}
