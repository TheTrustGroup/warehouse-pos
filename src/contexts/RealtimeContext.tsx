/**
 * Realtime connection status for Supabase Realtime (cross-device sync).
 * useInventoryRealtime updates status; RealtimeSyncIndicator displays it.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface RealtimeContextType {
  status: RealtimeStatus;
  setStatus: (s: RealtimeStatus) => void;
  /** When disconnected > this ms, show "Reconnecting..." banner */
  disconnectedSince: number | null;
  setDisconnectedSince: (t: number | null) => void;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<RealtimeStatus>('disconnected');
  const [disconnectedSince, setDisconnectedSince] = useState<number | null>(null);

  const setStatusStable = useCallback((s: RealtimeStatus) => {
    setStatus(s);
    if (s === 'connected' || s === 'connecting') setDisconnectedSince(null);
    else if (s === 'error' || s === 'disconnected') setDisconnectedSince((prev) => prev ?? Date.now());
  }, []);

  const setDisconnectedSinceStable = useCallback((t: number | null) => {
    setDisconnectedSince(t);
  }, []);

  const value: RealtimeContextType = {
    status,
    setStatus: setStatusStable,
    disconnectedSince,
    setDisconnectedSince: setDisconnectedSinceStable,
  };

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtimeContext(): RealtimeContextType | undefined {
  return useContext(RealtimeContext);
}

export function useRealtimeStatus(): RealtimeStatus {
  const ctx = useRealtimeContext();
  return ctx?.status ?? 'disconnected';
}
