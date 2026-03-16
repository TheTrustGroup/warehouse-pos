import { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileMenu } from './MobileMenu';
import { MobileBottomNav } from './MobileBottomNav';
import { MoreMenuSheet } from './MoreMenuSheet';
import { SyncStatusBar } from '../SyncStatusBar';
import { ConflictModalContainer } from '../ConflictModalContainer';
import { ApiStatusProvider, useApiStatus } from '../../contexts/ApiStatusContext';
import { useCriticalData } from '../../contexts/CriticalDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeContext } from '../../contexts/RealtimeContext';
import { PERMISSIONS } from '../../types/permissions';
import { Button } from '../ui/Button';

const DISMISS_BANNER_KEY = 'dismiss_degraded_banner_session';
const BANNER_DEBOUNCE_MS = 4000;
const MOBILE_BREAKPOINT = 1024;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  );
  useEffect(() => {
    const m = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = () => setIsMobile(m.matches);
    m.addEventListener('change', handler);
    return () => m.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

/** Layout: single vertical rhythm — section spacing (24px) and consistent main padding. Mobile-first. */
export function Layout() {
  return (
    <ApiStatusProvider>
      <LayoutContent />
    </ApiStatusProvider>
  );
}

/** Prefetch POS route chunk when user can access POS but is on another page (faster navigation to /pos). */
function usePrefetchPOSChunk() {
  const pathname = useLocation().pathname;
  const { hasPermission } = useAuth();
  useEffect(() => {
    if (pathname === '/pos' || !hasPermission(PERMISSIONS.POS.ACCESS)) return;
    import('../../pages/POSPage');
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps -- only re-run when route changes; hasPermission is stable
}

function LayoutContent() {
  const location = useLocation();
  const isPOS = location.pathname === '/pos';
  const isMobile = useIsMobile();
  usePrefetchPOSChunk();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const { isDegraded: degraded, retry } = useApiStatus();
  const [showBanner, setShowBanner] = useState(false);
  const degradedSinceRef = useRef<number | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(DISMISS_BANNER_KEY) === '1';
  });
  const { criticalDataError, isSyncingCriticalData, reloadCriticalData } = useCriticalData();
  const realtimeContext = useRealtimeContext();
  const [now, setNow] = useState(() => Date.now());
  const disconnectedSince = realtimeContext?.disconnectedSince ?? null;
  const realtimeStatus = realtimeContext?.status ?? 'disconnected';
  const showReconnectingBanner =
    disconnectedSince != null &&
    (realtimeStatus === 'error' || realtimeStatus === 'disconnected') &&
    now - disconnectedSince >= 30_000;

  useEffect(() => {
    if (!showReconnectingBanner) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [showReconnectingBanner]);

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
    <div className="min-h-[var(--min-h-viewport)] bg-[var(--edk-bg)]">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <MobileMenu
        open={isMobile ? mobileMenuOpen : undefined}
        onClose={isMobile ? () => setMobileMenuOpen(false) : undefined}
      />
      {isMobile && (
        <MoreMenuSheet open={moreMenuOpen} onClose={() => setMoreMenuOpen(false)} />
      )}
      {!isPOS && <Header />}
      {isMobile && (
        <MobileBottomNav onMoreClick={() => setMoreMenuOpen(true)} />
      )}
      {/* Banners: syncing matches loading screen (red ring + Barlow); others keep tokens */}
      {(isSyncingCriticalData || criticalDataError || showReconnectingBanner || showDegradedBanner) && (
        <div
          className="lg:ml-[var(--edk-sidebar-w)] mt-[calc(var(--edk-topbar-h)+var(--safe-top))] min-h-[2.75rem] flex items-stretch border-b border-[var(--edk-border)]"
          style={{ background: isSyncingCriticalData ? 'var(--edk-bg)' : 'var(--edk-amber-bg)' }}
        >
          {isSyncingCriticalData && (
            <div
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4"
              role="status"
              aria-live="polite"
            >
              <span
                className="rounded-full shrink-0"
                style={{
                  width: 24,
                  height: 24,
                  borderWidth: 3,
                  borderStyle: 'solid',
                  borderColor: 'var(--edk-border)',
                  borderTopColor: 'var(--edk-red)',
                  animation: 'edk-spin 0.8s linear infinite',
                }}
                aria-hidden
              />
              <span
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  letterSpacing: '0.08em',
                  color: 'var(--edk-ink-3)',
                  textTransform: 'uppercase',
                }}
              >
                Syncing inventory & orders…
              </span>
            </div>
          )}
          {criticalDataError && !isSyncingCriticalData && (
            <div className="w-full flex items-center justify-center gap-3 flex-wrap py-2.5 px-4 text-sm font-medium text-[var(--edk-ink)]" role="alert">
              <span>Initial load had issues: {criticalDataError}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => reloadCriticalData()} className="underline font-semibold hover:no-underline text-[var(--edk-ink)]">
                Retry
              </Button>
            </div>
          )}
          {showReconnectingBanner && !isSyncingCriticalData && !criticalDataError && (
            <div className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium text-[var(--edk-ink-2)]" role="status" aria-live="polite">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--edk-amber)] animate-pulse shrink-0" aria-hidden />
              <span>Reconnecting… Your data may be slightly delayed.</span>
            </div>
          )}
          {showDegradedBanner && !isSyncingCriticalData && !criticalDataError && !showReconnectingBanner && (
            <div className="w-full flex items-center justify-center gap-3 flex-wrap py-2.5 px-4 text-sm font-medium text-[var(--edk-ink)]" role="status">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--edk-amber)] shrink-0" aria-hidden />
              <span>Server temporarily unavailable. Last saved data — read-only.</span>
              <Button type="button" variant="ghost" size="sm" onClick={handleTryAgain} className="underline font-semibold hover:no-underline text-[var(--edk-ink)]">
                Try again
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleDismissBanner} className="text-[var(--edk-ink-2)] hover:text-[var(--edk-ink)] font-medium">
                Dismiss
              </Button>
            </div>
          )}
        </div>
      )}
      {/* Main: offset by sidebar and topbar; mobile 52px topbar + clear bottom nav (64px + safe area + 16px) */}
      <main
        className={`lg:ml-[var(--edk-sidebar-w)] pt-[52px] md:pt-16 lg:pt-6 pl-[max(0.75rem,var(--safe-left))] pr-[max(0.75rem,var(--safe-right))] lg:px-6 min-h-[calc(var(--min-h-viewport)-var(--edk-topbar-h))] max-w-[1600px] overflow-x-hidden overflow-y-auto ${
          showDegradedBanner || showSyncingBar ? 'mt-0' : isPOS ? 'mt-0' : isMobile ? 'mt-0' : 'mt-[calc(var(--edk-topbar-h)+var(--safe-top))]'
        } ${
          isMobile
            ? 'pb-[calc(64px+env(safe-area-inset-bottom,0px)+16px)]'
            : 'pb-[max(3rem,calc(var(--safe-bottom)+3rem))]'
        }`}
      >
        <Outlet />
      </main>
      <SyncStatusBar />
      <ConflictModalContainer />
    </div>
  );
}
