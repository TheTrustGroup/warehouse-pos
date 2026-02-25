import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { API_BASE_URL } from './lib/api';
import { initObservability, startHealthPings } from './lib/observability';

/** Preconnect to API origin so first /me and product requests avoid DNS+TLS delay. */
if (typeof document !== 'undefined' && API_BASE_URL) {
  try {
    const origin = new URL(API_BASE_URL).origin;
    if (!document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = origin;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    }
  } catch {
    // ignore invalid URL
  }
}
import { initErrorHandlers } from './lib/initErrorHandlers';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import { isOfflineEnabled } from './lib/offlineFeatureFlag';
// Error reporting: set VITE_SENTRY_DSN and wire Sentry.captureException(err, { extra: ctx }) here.
// Only send to Sentry when getErrorReportingConsent() is true (user consent in Settings/Admin).
initObservability({
  healthUrl: import.meta.env.VITE_HEALTH_URL || undefined,
  reportError:
    import.meta.env.VITE_SENTRY_DSN && typeof window !== 'undefined'
      ? (err, ctx) => {
          if (import.meta.env.DEV) console.error('[Report]', err, ctx);
          // Sentry: if (getErrorReportingConsent()) Sentry.captureException(err, { extra: ctx });
        }
      : undefined,
});
if (import.meta.env.VITE_HEALTH_URL) startHealthPings();

if (typeof window !== 'undefined') {
  initErrorHandlers();
  /* Stability: same build version across Safari/Brave/Chrome (Phase 1). */
  if (typeof __APP_BUILD_VERSION__ !== 'undefined') {
    console.info('[App] Build version:', __APP_BUILD_VERSION__);
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// Register service worker only when offline mode is enabled (INTEGRATION_PLAN Phase 9)
if (typeof window !== 'undefined' && isOfflineEnabled()) {
  serviceWorkerRegistration.register({
    onUpdate: () => {
      window.dispatchEvent(new CustomEvent('sw-update'));
    },
  });
}
