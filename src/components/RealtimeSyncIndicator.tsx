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
        className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--edk-red)]"
        title="No internet connection"
        role="status"
        aria-live="polite"
      >
        <span className="relative flex h-2 w-2 rounded-full bg-[var(--edk-red)] shrink-0" aria-hidden />
        <span className="hidden sm:inline">Offline</span>
      </span>
    );
  }

  switch (status) {
    case 'connected':
      return (
        <span
          className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--edk-green)]"
          title="Live updates on"
          role="status"
          aria-live="polite"
        >
          <span className="relative flex h-2 w-2 rounded-full bg-[var(--edk-green)] animate-pulse shrink-0" aria-hidden />
          <span className="hidden sm:inline">Live</span>
        </span>
      );
    case 'connecting':
      return (
        <span
          className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--edk-amber)]"
          title="Reconnecting…"
          role="status"
          aria-live="polite"
        >
          <span className="relative flex h-2 w-2 rounded-full bg-[var(--edk-amber)] shrink-0" aria-hidden />
          <span className="hidden sm:inline">Syncing…</span>
        </span>
      );
    case 'error':
    case 'disconnected':
    default:
      return (
        <span
          className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--edk-red)]"
          title={isOnline ? 'Live updates paused — see docs/REALTIME_CROSS_DEVICE_SYNC.md' : 'No internet connection'}
          role="status"
          aria-live="polite"
        >
          <span className="relative flex h-2 w-2 rounded-full bg-[var(--edk-red)] opacity-90 shrink-0" aria-hidden />
          <span className="hidden sm:inline">Offline</span>
        </span>
      );
  }
}
