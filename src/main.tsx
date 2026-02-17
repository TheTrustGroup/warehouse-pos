import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { initObservability, startHealthPings } from './lib/observability';
import { initErrorHandlers } from './lib/initErrorHandlers';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import { isOfflineEnabled } from './lib/offlineFeatureFlag';
import { prodDebug } from './lib/prodDebug';

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
  // #region agent log
  prodDebug({
    location: 'main.tsx:startup',
    message: 'App startup',
    data: {
      buildVersion: typeof __APP_BUILD_VERSION__ !== 'undefined' ? __APP_BUILD_VERSION__ : 'unknown',
      env: typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env.MODE ?? 'unknown') : 'unknown',
    },
    hypothesisId: 'build',
  });
  // #endregion
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
