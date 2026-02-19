/**
 * Browser compatibility check. Shows upgrade message for unsupported browsers.
 * Minimum: Chrome 87+, Safari 14+, Firefox 78+, Edge 87+ (IndexedDB + Service Worker + ES2020).
 */

import { useState, useEffect, type ReactNode } from 'react';

const STORAGE_KEY = 'browser_check_dismissed';

function getIsSupported(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (!window.indexedDB) return false;
    if (!('serviceWorker' in navigator)) return false;
    if (typeof Promise?.allSettled !== 'function') return false;
    const ua = navigator.userAgent;
    const isChrome = /Chrome\/(\d+)/.exec(ua);
    const isSafari = /Version\/(\d+).*Safari/.exec(ua) || /AppleWebKit.*Version\/(\d+)/.exec(ua);
    const isFirefox = /Firefox\/(\d+)/.exec(ua);
    const isEdge = /Edg\/(\d+)/.exec(ua);
    const version = (m: RegExpExecArray | null) => (m ? parseInt(m[1], 10) : 0);
    if (isChrome && !isEdge) return version(isChrome) >= 87;
    if (isEdge) return version(isEdge) >= 87;
    if (isSafari) return version(isSafari) >= 14;
    if (isFirefox) return version(isFirefox) >= 78;
    return true;
  } catch {
    return false;
  }
}

export function BrowserCheck({ children }: { children: ReactNode }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setSupported(getIsSupported());
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const hide = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* localStorage not available */
    }
  };

  if (supported === null || supported) return <>{children}</>;
  if (dismissed) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 p-4">
      <div className="solid-card max-w-md p-6 text-center">
        <h1 className="text-xl font-bold text-slate-900 mb-2">Browser not fully supported</h1>
        <p className="text-slate-600 text-sm mb-4">
          This app works best on <strong>Chrome 87+</strong>, <strong>Safari 14+</strong>, <strong>Firefox 78+</strong>, or <strong>Edge 87+</strong> for offline features and reliability.
        </p>
        <p className="text-slate-500 text-xs mb-6">
          Please upgrade your browser or use a supported one. You can continue at your own risk.
        </p>
        <div className="flex gap-3 justify-center">
          <a
            href="https://www.google.com/chrome/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-primary-600 text-white font-medium text-sm hover:bg-primary-700"
          >
            Get Chrome
          </a>
          <button
            type="button"
            onClick={hide}
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50"
          >
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  );
}
