/**
 * Small topbar indicator: Live (green) / Syncing… (yellow) / Offline (red).
 * Cashiers can see at a glance if their device is receiving real-time updates.
 */

import { useRealtimeStatus } from '../contexts/RealtimeContext';

export function RealtimeSyncIndicator() {
  const status = useRealtimeStatus();
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!isOnline) {
    return (
      <span
        className="flex items-center gap-1.5 text-[11px] font-medium text-red-600"
        title="No internet connection"
        role="status"
        aria-live="polite"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-100" />
        </span>
        <span className="hidden sm:inline">Offline</span>
      </span>
    );
  }

  switch (status) {
    case 'connected':
      return (
        <span
          className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600"
          title="Live updates on"
          role="status"
          aria-live="polite"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 animate-pulse" />
          </span>
          <span className="hidden sm:inline">Live</span>
        </span>
      );
    case 'connecting':
      return (
        <span
          className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600"
          title="Reconnecting…"
          role="status"
          aria-live="polite"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-amber-500" />
          </span>
          <span className="hidden sm:inline">Syncing…</span>
        </span>
      );
    case 'error':
    case 'disconnected':
    default:
      return (
        <span
          className="flex items-center gap-1.5 text-[11px] font-medium text-red-600"
          title={isOnline ? 'Live updates paused — check docs/REALTIME_OFFLINE.md or console' : 'No internet connection'}
          role="status"
          aria-live="polite"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-90" />
          </span>
          <span className="hidden sm:inline">Offline</span>
        </span>
      );
  }
}
