import { useState, useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileMenu } from './MobileMenu';
import { SyncStatusBar } from '../SyncStatusBar';
import { ConflictModalContainer } from '../ConflictModalContainer';
import { ApiStatusProvider, useApiStatus } from '../../contexts/ApiStatusContext';
import { useCriticalData } from '../../contexts/CriticalDataContext';
import { Button } from '../ui/Button';

const DISMISS_BANNER_KEY = 'dismiss_degraded_banner_session';
/** Only show "server offline" banner after degraded for this long to avoid jitter from brief blips. */
const BANNER_DEBOUNCE_MS = 4000;

/** Layout: single vertical rhythm — section spacing (24px) and consistent main padding. Mobile-first. */
export function Layout() {
  return (
    <ApiStatusProvider>
      <LayoutContent />
    </ApiStatusProvider>
  );
}

function LayoutContent() {
  const { isDegraded: degraded, retry } = useApiStatus();
  const [showBanner, setShowBanner] = useState(false);
  const degradedSinceRef = useRef<number | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(DISMISS_BANNER_KEY) === '1';
  });
  const { criticalDataError, isSyncingCriticalData, reloadCriticalData } = useCriticalData();

  // Debounce: show banner only after degraded for BANNER_DEBOUNCE_MS so brief flickers don't cause jitter
  useEffect(() => {
    if (degraded) {
      const now = Date.now();
      if (degradedSinceRef.current === null) degradedSinceRef.current = now;
      const elapsed = now - (degradedSinceRef.current ?? now);
      if (elapsed >= BANNER_DEBOUNCE_MS) {
        setShowBanner(true);
      } else {
        const t = setTimeout(() => setShowBanner(true), BANNER_DEBOUNCE_MS - elapsed);
        return () => clearTimeout(t);
      }
    } else {
      degradedSinceRef.current = null;
      setShowBanner(false);
    }
  }, [degraded]);

  // When circuit is no longer degraded, clear dismiss so the banner can show again next time
  useEffect(() => {
    if (!degraded && typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(DISMISS_BANNER_KEY);
      setDismissed(false);
    }
  }, [degraded]);

  const handleTryAgain = () => {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(DISMISS_BANNER_KEY);
    setDismissed(false);
    retry();
  };

  const handleDismissBanner = () => {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(DISMISS_BANNER_KEY, '1');
    setDismissed(true);
  };

  const showDegradedBanner = showBanner && degraded && !dismissed;
  const showSyncingBar = isSyncingCriticalData;

  return (
    <div className="min-h-[var(--min-h-viewport)] bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <MobileMenu />
      <Header />
      {/* Slim hint while phase 2 (inventory, orders) syncs in background after login */}
      {isSyncingCriticalData && (
        <div
          className="lg:ml-[280px] mt-[calc(72px+var(--safe-top))] bg-primary-50/90 text-primary-900 text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 border-b border-primary-200/50"
          role="status"
          aria-live="polite"
        >
          <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" aria-hidden />
          Syncing inventory & orders…
        </div>
      )}
      {/* In-flow banner: reserves layout space so content is never overlapped. Pushes main content down. */}
      {criticalDataError && (
        <div
          className="lg:ml-[280px] mt-[calc(72px+var(--safe-top))] bg-amber-500 text-amber-950 text-center py-2.5 px-4 text-sm font-medium flex items-center justify-center gap-3 flex-wrap min-h-[3rem] border-b border-amber-600/20"
          role="alert"
        >
          <span>Initial load had issues: {criticalDataError}</span>
          <Button type="button" variant="ghost" onClick={() => reloadCriticalData()} className="underline font-semibold hover:no-underline focus:outline-none focus:ring-2 focus:ring-amber-800 rounded">
            Retry
          </Button>
        </div>
      )}
      {showDegradedBanner && (
        <div
          className="lg:ml-[280px] mt-[calc(72px+var(--safe-top))] bg-amber-500 text-amber-950 text-center py-2.5 px-4 text-sm font-medium flex items-center justify-center gap-3 flex-wrap min-h-[3rem] border-b border-amber-600/20"
          role="status"
        >
          <span>Server temporarily unavailable. Last saved data — read-only. Add, edit, and sales disabled until server is back.</span>
          <Button
            type="button"
            variant="ghost"
            onClick={handleTryAgain}
            className="underline font-semibold hover:no-underline focus:outline-none focus:ring-2 focus:ring-amber-800 rounded"
          >
            Try again
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleDismissBanner}
            className="text-amber-900/80 hover:text-amber-950 font-medium focus:outline-none focus:ring-2 focus:ring-amber-800 rounded"
          >
            Dismiss
          </Button>
        </div>
      )}
      {/* Phase 6: main padding ≥16px (max(1rem, safe-area)); no edge-touch; reserves space for SyncStatusBar */}
      <main
        className={`lg:ml-[280px] pt-20 lg:pt-8 pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] lg:px-8 pb-[max(3.5rem,calc(var(--safe-bottom)+3.5rem))] min-h-[calc(var(--min-h-viewport)-72px)] max-w-[1600px] overflow-x-hidden ${
          showDegradedBanner || showSyncingBar ? 'mt-0' : 'mt-[calc(72px+var(--safe-top))]'
        }`}
      >
        <Outlet />
      </main>
      <SyncStatusBar />
      <ConflictModalContainer />
    </div>
  );
}
