/**
 * UpdateBanner — shows a fixed banner when a new deployment is detected (polling /api/health buildId)
 * or when a chunk load error occurs (e.g. MIME type / dynamic import failure). User can refresh or dismiss for the session.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE_URL } from '../lib/api';

const HEALTH_URL = `${API_BASE_URL.replace(/\/$/, '')}/api/health`;
const POLL_INTERVAL_MS = 60_000;

function isChunkLoadError(message: string): boolean {
  const m = (message || '').toLowerCase();
  return (
    m.includes('mime type') ||
    m.includes('loading chunk') ||
    m.includes('failed to fetch dynamically imported module')
  );
}

export function UpdateBanner() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const initialBuildIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showBanner = useCallback(() => {
    setVisible(true);
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setVisible(false);
  }, []);

  const handleRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  // Poll /api/health every 60s and compare buildId to initial
  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      try {
        const res = await fetch(HEALTH_URL, { cache: 'no-store' });
        if (!res.ok || !mounted) return;
        const data = (await res.json()) as { status?: string; buildId?: string };
        const buildId = data?.buildId ?? null;
        if (buildId == null) return;
        if (initialBuildIdRef.current === null) {
          initialBuildIdRef.current = buildId;
          return;
        }
        if (initialBuildIdRef.current !== buildId) {
          showBanner();
        }
      } catch {
        // ignore network errors; next poll will retry
      }
    };

    // First fetch to set initial buildId (no banner on first load)
    poll();

    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [showBanner]);

  // Global error listener for chunk load errors
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      if (event.message && isChunkLoadError(event.message)) {
        showBanner();
      }
    };
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, [showBanner]);

  if (!visible || dismissed) return null;

  return (
    <div
      role="banner"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        width: '100%',
        zIndex: 99999,
        backgroundColor: '#1a1a1a',
        color: '#fff',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        flexWrap: 'wrap',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        animation: 'updateBannerSlideDown 0.3s ease-out',
      }}
    >
      <style>{`
        @keyframes updateBannerSlideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <span style={{ fontSize: '14px', fontWeight: 500 }}>A new update is available</span>
      <button
        type="button"
        onClick={handleRefresh}
        style={{
          padding: '8px 16px',
          fontSize: '14px',
          fontWeight: 600,
          color: '#fff',
          backgroundColor: '#E8281A',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        Refresh to update
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          marginLeft: 'auto',
          padding: '4px',
          background: 'transparent',
          border: 'none',
          color: 'rgba(255,255,255,0.8)',
          cursor: 'pointer',
          fontSize: '18px',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
