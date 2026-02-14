/**
 * Network status context: exposes useNetworkStatus globally and renders
 * offline / back-online / syncing banners.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { syncService } from '../services/syncService';
import { recordOfflineDuration } from '../lib/telemetry';
import { isOfflineEnabled } from '../lib/offlineFeatureFlag';

const BACK_ONLINE_DISPLAY_MS = 4000;
const FADE_OUT_MS = 400;

interface NetworkStatusContextValue {
  isOnline: boolean;
  isServerReachable: boolean;
  lastChecked: Date;
  checkConnection: () => Promise<boolean>;
  /** Sync progress 0–100 when a sync is in progress; null otherwise. */
  syncProgress: number | null;
}

const NetworkStatusContext = createContext<NetworkStatusContextValue | undefined>(undefined);

export function useNetworkStatusContext(): NetworkStatusContextValue {
  const ctx = useContext(NetworkStatusContext);
  if (ctx === undefined) {
    throw new Error('useNetworkStatusContext must be used within NetworkStatusProvider');
  }
  return ctx;
}

interface NetworkStatusProviderProps {
  children: ReactNode;
}

export function NetworkStatusProvider({ children }: NetworkStatusProviderProps) {
  const { isOnline, isServerReachable, lastChecked, checkConnection } = useNetworkStatus();
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const [showBackOnlineBanner, setShowBackOnlineBanner] = useState(false);
  const [backOnlineFadeOut, setBackOnlineFadeOut] = useState(false);
  const previousOnlineRef = useRef(isOnline);
  const offlineSinceRef = useRef<number | null>(null);
  const hideBackOnlineTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeOutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimeouts = useCallback(() => {
    if (hideBackOnlineTimeoutRef.current) {
      clearTimeout(hideBackOnlineTimeoutRef.current);
      hideBackOnlineTimeoutRef.current = null;
    }
    if (fadeOutTimeoutRef.current) {
      clearTimeout(fadeOutTimeoutRef.current);
      fadeOutTimeoutRef.current = null;
    }
  }, []);

  // Track offline start for telemetry
  useEffect(() => {
    if (!isOnline) {
      offlineSinceRef.current = offlineSinceRef.current ?? Date.now();
    } else {
      if (offlineSinceRef.current != null) {
        recordOfflineDuration(Date.now() - offlineSinceRef.current).catch(() => {});
        offlineSinceRef.current = null;
      }
    }
  }, [isOnline]);

  // When we transition from offline to online, show "Back Online - Syncing..." and optionally trigger sync (gated by offline feature flag)
  useEffect(() => {
    const wasOffline = !previousOnlineRef.current;
    if (wasOffline && isOnline) {
      setShowBackOnlineBanner(true);
      setBackOnlineFadeOut(false);
      clearHideTimeouts();
      if (isOfflineEnabled()) {
        syncService.processSyncQueue().catch(() => {});
      }
    }
    previousOnlineRef.current = isOnline;
  }, [isOnline, clearHideTimeouts]);

  // Listen to sync events for progress
  useEffect(() => {
    const emitter = syncService.getEmitter();
    const onProgress = (e: CustomEvent<{ percent: number }>) => {
      setSyncProgress(e.detail?.percent ?? null);
    };
    const onCompleted = () => {
      setSyncProgress(100);
      if (typeof navigator !== 'undefined' && navigator.serviceWorker?.ready) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.active?.postMessage({ type: 'SHOW_SYNC_NOTIFICATION' });
        });
      }
      clearHideTimeouts();
      hideBackOnlineTimeoutRef.current = setTimeout(() => {
        setBackOnlineFadeOut(true);
        fadeOutTimeoutRef.current = setTimeout(() => {
          setShowBackOnlineBanner(false);
          setBackOnlineFadeOut(false);
          setSyncProgress(null);
        }, FADE_OUT_MS);
      }, 800);
    };
    const onFailed = () => {
      setSyncProgress(null);
    };
    emitter.addEventListener('sync-progress', onProgress as EventListener);
    emitter.addEventListener('sync-completed', onCompleted as EventListener);
    emitter.addEventListener('sync-failed', onFailed as EventListener);
    return () => {
      emitter.removeEventListener('sync-progress', onProgress as EventListener);
      emitter.removeEventListener('sync-completed', onCompleted as EventListener);
      emitter.removeEventListener('sync-failed', onFailed as EventListener);
      clearHideTimeouts();
    };
  }, [clearHideTimeouts]);

  // If back-online banner is showing and no sync started, hide after a delay
  useEffect(() => {
    if (!showBackOnlineBanner || !isOnline) return;
    const t = setTimeout(() => {
      if (syncProgress === null) {
        setBackOnlineFadeOut(true);
        setTimeout(() => {
          setShowBackOnlineBanner(false);
          setBackOnlineFadeOut(false);
        }, FADE_OUT_MS);
      }
    }, BACK_ONLINE_DISPLAY_MS);
    return () => clearTimeout(t);
  }, [showBackOnlineBanner, isOnline, syncProgress]);

  const value: NetworkStatusContextValue = {
    isOnline,
    isServerReachable,
    lastChecked,
    checkConnection,
    syncProgress,
  };

  const showOfflineBanner = !isOnline;
  const showBackOnline = isOnline && showBackOnlineBanner;
  const bannerVisible = showOfflineBanner || showBackOnline;

  return (
    <NetworkStatusContext.Provider value={value}>
      <div className={bannerVisible ? 'pt-10' : ''}>
        {children}
      </div>
      {/* Fixed top banners for network status */}
      {showOfflineBanner && (
        <div
          className="fixed top-0 left-0 right-0 z-[70] bg-amber-400 text-amber-950 text-center py-2.5 px-4 text-sm font-medium shadow-md"
          role="status"
          aria-live="polite"
        >
          Working Offline — Read-only. Add, edit, and sales disabled.
        </div>
      )}
      {showBackOnline && (
        <div
          className={`fixed top-0 left-0 right-0 z-[70] bg-emerald-500 text-emerald-950 text-center py-2.5 px-4 text-sm font-medium shadow-md transition-opacity duration-300 ${
            backOnlineFadeOut ? 'opacity-0' : 'opacity-100'
          }`}
          role="status"
          aria-live="polite"
        >
          Back Online — Syncing...
          {syncProgress != null && (
            <span className="ml-2 font-semibold">
              {syncProgress === 100 ? 'Done' : `${syncProgress}%`}
            </span>
          )}
        </div>
      )}
    </NetworkStatusContext.Provider>
  );
}

